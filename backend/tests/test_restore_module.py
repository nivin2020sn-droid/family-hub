"""End-to-end test for the Restore Backup pipeline.

Strategy:
  1. Seed a small "marker" collection in MongoDB.
  2. Generate a backup archive on disk via `_dump_database_to_tar`.
  3. Wipe the marker collection.
  4. Use `_read_backup_blocking` to verify archive parsing.
  5. Insert a fake backup_runs row pointing at a LOCAL file (we skip
     the Drive download path) and call `run_restore` after monkey-patching
     `_ensure_local_archive` to just hand back the on-disk file.
  6. Assert the marker collection is restored AND restore_runs has the
     audit row.
"""

import asyncio
import os

import pytest
from motor.motor_asyncio import AsyncIOMotorClient


@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="module")
def db():
    os.environ.setdefault("JWT_SECRET", "test-secret")
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client["restore_test_db"]


async def _seed(db):
    await db.restore_marker.delete_many({})
    await db.restore_marker.insert_many([
        {"id": "1", "label": "alpha"},
        {"id": "2", "label": "beta"},
        {"id": "3", "label": "gamma"},
    ])


async def _make_backup_archive(db):
    from backup_module import _dump_database_to_tar
    return await _dump_database_to_tar(db, db.name)


async def _restore_from_local(db, archive_path, drive_file_name):
    """Patch the Drive download step so we can run the real restore
    pipeline against a local file (no Drive credentials needed)."""
    import backup_module as bm

    real_ensure = bm._ensure_local_archive

    async def _fake_ensure(_db, _file_id):
        return archive_path, os.path.getsize(archive_path)

    bm._ensure_local_archive = _fake_ensure

    # Insert a fake "successful" backup_runs row.
    await db.backup_runs.insert_one({
        "id": "fake-run-1",
        "trigger": "manual",
        "status": "success",
        "drive_file_id": "FAKE-FILE-ID",
        "drive_file_name": drive_file_name,
        "started_at": "2026-01-01T00:00:00+00:00",
        "finished_at": "2026-01-01T00:00:05+00:00",
        "size_bytes": os.path.getsize(archive_path),
        "collections_count": 1,
    })

    try:
        # Skip the safety pre-restore backup — we don't have Drive in this
        # test environment, so the upload step would fail. The pipeline's
        # safety logic is covered by the OTHER restore-flow tests.
        result = await bm.run_restore(
            db,
            run_id="fake-run-1",
            actor_email="pytest@example.com",
            skip_safety_backup=True,
        )
    finally:
        bm._ensure_local_archive = real_ensure
    return result


def test_restore_pipeline_end_to_end(db, event_loop):
    async def main():
        await _seed(db)

        archive_path, size, manifest = await _make_backup_archive(db)
        try:
            assert size > 0
            assert any(c["name"] == "restore_marker" for c in manifest["collections"])

            # Round-trip parse check.
            from backup_module import _read_backup_blocking
            mf, colls = await asyncio.to_thread(_read_backup_blocking, archive_path)
            assert mf["version"] == 1
            assert "restore_marker" in colls
            assert len(colls["restore_marker"]) == 3

            # Wipe the marker collection — restore should bring it back.
            await db.restore_marker.delete_many({})
            assert await db.restore_marker.count_documents({}) == 0

            # Run the restore against the local archive.
            result = await _restore_from_local(db, archive_path, "test-archive.tar.gz")

            assert result["status"] == "success", f"Restore failed: {result.get('error')}"
            assert result["collections_restored"] >= 1
            assert result["documents_restored"] >= 3
            # Audit row exists.
            audit = await db.restore_runs.find_one({"id": result["id"]}, {"_id": 0})
            assert audit is not None
            assert audit["actor_email"] == "pytest@example.com"

            # Marker docs are back.
            restored = await db.restore_marker.find({}, {"_id": 0}).to_list(10)
            labels = sorted(d["label"] for d in restored)
            assert labels == ["alpha", "beta", "gamma"]
        finally:
            try:
                os.remove(archive_path)
            except OSError:
                pass

    event_loop.run_until_complete(main())


def test_protected_collections_are_not_overwritten(db, event_loop):
    """`backup_settings` etc. must survive a restore from an older archive
    so the admin's Drive auth doesn't get clobbered."""
    async def main():
        # Seed two collections.
        await db.restore_marker.delete_many({})
        await db.backup_settings.delete_many({})
        await db.restore_marker.insert_one({"id": "x", "label": "current"})
        await db.backup_settings.insert_one({"_key": "global", "drive_connected": True, "marker": "DO-NOT-REPLACE"})

        # Make a backup that contains BOTH.
        from backup_module import _dump_database_to_tar
        archive_path, _, _ = await _dump_database_to_tar(db, db.name)
        try:
            # Now mutate both collections so the restore would visibly
            # overwrite them if it were free to.
            await db.restore_marker.update_one({"id": "x"}, {"$set": {"label": "MUTATED"}})
            await db.backup_settings.update_one(
                {"_key": "global"}, {"$set": {"marker": "NEW-CURRENT-VALUE"}}
            )

            result = await _restore_from_local(db, archive_path, "isolation-test.tar.gz")
            assert result["status"] == "success"
            assert "backup_settings" in (result.get("skipped_collections") or [])

            # Regular collection — restored to the snapshot's value.
            marker = await db.restore_marker.find_one({"id": "x"}, {"_id": 0})
            assert marker["label"] == "current"

            # Protected collection — kept the CURRENT value.
            settings = await db.backup_settings.find_one({"_key": "global"}, {"_id": 0})
            assert settings["marker"] == "NEW-CURRENT-VALUE"
        finally:
            try:
                os.remove(archive_path)
            except OSError:
                pass

    event_loop.run_until_complete(main())


def test_restore_rejects_corrupt_manifest(db, event_loop, tmp_path_factory):
    """A tar without a valid manifest.json must abort before any
    DB writes."""
    import io
    import tarfile
    archive_path = str(tmp_path_factory.mktemp("bad") / "broken.tar.gz")
    with tarfile.open(archive_path, "w:gz") as tar:
        # Write a malformed manifest.
        data = b"{not valid json"
        info = tarfile.TarInfo("manifest.json")
        info.size = len(data)
        tar.addfile(info, io.BytesIO(data))

    async def main():
        await db.restore_marker.delete_many({})
        await db.restore_marker.insert_one({"id": "z", "label": "keep-me"})
        result = await _restore_from_local(db, archive_path, "corrupt.tar.gz")
        assert result["status"] == "failed"
        assert "manifest" in (result.get("error") or "").lower()
        # The pre-existing data must be untouched.
        keep = await db.restore_marker.find_one({"id": "z"}, {"_id": 0})
        assert keep["label"] == "keep-me"

    event_loop.run_until_complete(main())
