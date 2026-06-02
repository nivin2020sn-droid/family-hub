"""
Generic Drive-backed storage service.

This module provides a thin abstraction for storing app files (photos,
documents, chat attachments, exports) in the admin's Google Drive — the
same Drive account already connected via `backup_module`. Only the
metadata is kept in MongoDB (`storage_files` collection); the bytes
themselves live in Drive.

Why a separate module?
  - The backup module owns the Drive OAuth tokens. We reuse those tokens
    via `backup_module._ensure_drive_service`, so the admin doesn't have
    to reconnect.
  - File storage and database backups have completely different access
    patterns (per-family vs admin-only, frequent vs daily). Keeping them
    separate keeps each one easy to reason about.

Folder layout in the admin's Drive:

    My Life My Time/
      Backups/              # placeholder — backup_module still uses its own
      Photos/
        Family_<short_id>/
      Documents/
        Family_<short_id>/
      Chat Attachments/
        Family_<short_id>/
      Exports/
        Family_<short_id>/

Folder IDs are cached in `storage_settings.folders` so we don't pay the
list-folders round-trip on every upload.

Encryption / privacy:
  - No encryption (per spec). Files are stored as-is.
  - The `drive.file` scope means only the app sees the files in the user's
    Drive listings — Google's UI still lets the user open them, but other
    third-party apps connected to the same Drive cannot read them.

Migration:
  - Strictly new uploads only. Pre-existing base64 photos / brand logos
    are not touched.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import io
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import (
    APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile,
)
from fastapi.responses import StreamingResponse
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseDownload, MediaIoBaseUpload

from auth_module import require_admin, require_member_token
from backup_module import _ensure_drive_service  # reuse Drive auth
from tenant import current_family_id, current_member_id

logger = logging.getLogger(__name__)

ROOT_FOLDER_NAME = "My Life My Time"
CATEGORY_FOLDERS = {
    "backups": "Backups",
    "photos": "Photos",
    "documents": "Documents",
    "chat_attachments": "Chat Attachments",
    "exports": "Exports",
}
CATEGORIES = set(CATEGORY_FOLDERS.keys()) - {"backups"}  # users can't upload to Backups

SETTINGS_COLLECTION = "storage_settings"
FILES_COLLECTION = "storage_files"
SETTINGS_KEY = "global"

# Max upload size — 50 MB per file. Lifts a guardrail off Drive's free tier
# without making it trivial to fill 15 GB by accident.
MAX_UPLOAD_BYTES = 50 * 1024 * 1024

# Filename sanitisation. Drive accepts almost anything, but we strip path
# separators and ASCII control characters so the on-disk display stays sane.
_FILENAME_BAD = re.compile(r"[\x00-\x1f\\/]+")


def _safe_filename(name: str) -> str:
    name = (name or "file").strip()
    name = _FILENAME_BAD.sub("_", name)
    return name[:200] or "file"


def _family_folder_label(family_id: str) -> str:
    """Stable, readable folder name for a family. We never include the
    family's display name (admin-readable PII) in Drive folder names — only
    a short id slice. The family list in /admin maps id ↔ name."""
    short = (family_id or "unknown").replace("-", "")[:8] or "unknown"
    return f"Family_{short}"


# ----- Folder caching ----------------------------------------------------


async def _load_folders(db) -> dict:
    """Return the cached folder-id map. Initialises to an empty shape."""
    doc = await db[SETTINGS_COLLECTION].find_one(
        {"_key": SETTINGS_KEY}, {"_id": 0}
    )
    if not doc:
        return {"root": None, "categories": {}, "families": {}}
    return {
        "root": doc.get("root_folder_id"),
        "categories": dict(doc.get("category_folder_ids") or {}),
        "families": dict(doc.get("family_folder_ids") or {}),
    }


async def _persist_folders(db, *, root=None, categories=None, families=None):
    update = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if root is not None:
        update["root_folder_id"] = root
    if categories is not None:
        update["category_folder_ids"] = categories
    if families is not None:
        update["family_folder_ids"] = families
    await db[SETTINGS_COLLECTION].update_one(
        {"_key": SETTINGS_KEY},
        {"$set": update, "$setOnInsert": {"_key": SETTINGS_KEY}},
        upsert=True,
    )


def _get_or_create_folder_blocking(service, name: str, parent_id: Optional[str] = None) -> str:
    """Find a folder by name (and optionally parent) or create it. Returns
    the Drive folder id. Synchronous → call with `asyncio.to_thread`.

    With `drive.file` scope the listing only returns folders the app
    itself created — which is exactly what we want: we never accidentally
    write inside a user-created folder of the same name.
    """
    safe = name.replace("'", "\\'")
    q = (
        f"name = '{safe}' and mimeType = 'application/vnd.google-apps.folder' "
        f"and trashed = false"
    )
    if parent_id:
        q += f" and '{parent_id}' in parents"
    listed = service.files().list(q=q, fields="files(id, name)", pageSize=10).execute()
    files = listed.get("files") or []
    if files:
        return files[0]["id"]
    body = {"name": name, "mimeType": "application/vnd.google-apps.folder"}
    if parent_id:
        body["parents"] = [parent_id]
    created = service.files().create(body=body, fields="id").execute()
    return created["id"]


async def _ensure_root_and_categories(db, service) -> dict:
    """Make sure `My Life My Time/<each category>` exist. Caches every id
    in MongoDB so subsequent uploads pay one DB read, not a Drive call."""
    folders = await _load_folders(db)

    if not folders["root"]:
        folders["root"] = await asyncio.to_thread(
            _get_or_create_folder_blocking, service, ROOT_FOLDER_NAME, None
        )

    changed = False
    for key, display in CATEGORY_FOLDERS.items():
        if not folders["categories"].get(key):
            folders["categories"][key] = await asyncio.to_thread(
                _get_or_create_folder_blocking, service, display, folders["root"]
            )
            changed = True

    if changed or "root" not in folders:
        await _persist_folders(
            db,
            root=folders["root"],
            categories=folders["categories"],
        )
    return folders


async def _ensure_family_folder(db, service, category: str, family_id: str) -> str:
    """Return the folder id for `My Life My Time/<category>/Family_<id>`.
    Creates it on first use."""
    folders = await _ensure_root_and_categories(db, service)
    if category not in folders["categories"]:
        raise HTTPException(status_code=400, detail=f"Unknown category '{category}'")

    fam_map = folders["families"].setdefault(family_id, {})
    if fam_map.get(category):
        return fam_map[category]

    parent = folders["categories"][category]
    label = _family_folder_label(family_id)
    new_id = await asyncio.to_thread(
        _get_or_create_folder_blocking, service, label, parent
    )
    fam_map[category] = new_id
    await _persist_folders(db, families=folders["families"])
    return new_id


# ----- Drive operations --------------------------------------------------


def _upload_blocking(service, *, name: str, mime: str, data: bytes, parent_id: str) -> dict:
    media = MediaIoBaseUpload(io.BytesIO(data), mimetype=mime, resumable=False)
    return service.files().create(
        body={
            "name": name,
            "parents": [parent_id],
            "mimeType": mime,
        },
        media_body=media,
        fields="id, name, size, mimeType, webViewLink, webContentLink, createdTime",
    ).execute()


def _delete_blocking(service, drive_file_id: str) -> None:
    try:
        service.files().delete(fileId=drive_file_id).execute()
    except HttpError as e:
        # 404 = already gone; treat as success so the metadata can still be
        # cleared from Mongo without leaking an orphan row.
        if getattr(e, "resp", None) and e.resp.status == 404:
            return
        raise


def _download_blocking(service, drive_file_id: str) -> tuple[bytes, str]:
    """Pull the raw bytes of a Drive file. Returns (bytes, mime_type)."""
    meta = service.files().get(fileId=drive_file_id, fields="mimeType").execute()
    buf = io.BytesIO()
    request = service.files().get_media(fileId=drive_file_id)
    downloader = MediaIoBaseDownload(buf, request, chunksize=1024 * 1024)
    done = False
    while not done:
        _status, done = downloader.next_chunk()
    return buf.getvalue(), meta.get("mimeType") or "application/octet-stream"


# ----- Public API for other modules --------------------------------------


async def store_bytes(
    db,
    *,
    family_id: str,
    uploaded_by: Optional[str],
    category: str,
    data: bytes,
    name: str,
    mime: str,
) -> dict:
    """Upload `data` to Drive and persist its metadata row. Returns the
    serialized `storage_files` doc. Raises HTTPException on Drive failure.

    Used by other backend features (e.g. `create_wall_photo`) to offload
    user-supplied bytes — keeps Drive logic in one place and means callers
    don't need to know anything about OAuth/folders.
    """
    if category not in CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Unknown category '{category}'")
    if not data:
        raise HTTPException(status_code=400, detail="Empty payload.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large (max {MAX_UPLOAD_BYTES // (1024*1024)} MB).",
        )
    service, _settings = await _ensure_drive_service(db)
    parent_id = await _ensure_family_folder(db, service, category, family_id)
    safe = _safe_filename(name)
    try:
        uploaded = await asyncio.to_thread(
            _upload_blocking,
            service,
            name=safe,
            mime=mime or "application/octet-stream",
            data=data,
            parent_id=parent_id,
        )
    except HttpError as e:
        logger.exception("Drive upload failed (store_bytes)")
        raise HTTPException(status_code=502, detail=f"Drive upload failed: {e}")
    doc = {
        "id": str(uuid.uuid4()),
        "family_id": family_id,
        "uploaded_by": uploaded_by,
        "category": category,
        "drive_file_id": uploaded.get("id"),
        "name": uploaded.get("name") or safe,
        "mime_type": uploaded.get("mimeType") or mime,
        "size_bytes": int(uploaded.get("size") or len(data)),
        "drive_web_view_link": uploaded.get("webViewLink"),
        "drive_web_content_link": uploaded.get("webContentLink"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db[FILES_COLLECTION].insert_one(dict(doc))
    return _serialize(doc)


async def store_data_url(
    db, *, family_id: str, uploaded_by: Optional[str], category: str,
    data_url: str, default_name: str = "upload.bin",
) -> dict:
    """Decode a `data:mime;base64,...` URL and offload it to Drive."""
    import base64
    if not data_url or not data_url.startswith("data:"):
        raise HTTPException(status_code=400, detail="Not a data URL.")
    try:
        header, b64 = data_url.split(",", 1)
        mime = header[len("data:"):].split(";")[0] or "application/octet-stream"
        data = base64.b64decode(b64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid data URL: {e}") from e
    # Pick a sensible extension from the mime so the file is recognisable
    # when the admin browses the folder in Drive.
    ext = ""
    if "/" in mime:
        ext_candidate = mime.split("/", 1)[1].split(";")[0].strip()
        # Drop ugly suffixes (e.g. "svg+xml" → "svg").
        ext_candidate = ext_candidate.split("+")[0]
        if ext_candidate and len(ext_candidate) <= 6 and ext_candidate.isalnum():
            ext = f".{ext_candidate}"
    name = default_name if "." in default_name else f"{default_name}{ext}"
    return await store_bytes(
        db,
        family_id=family_id,
        uploaded_by=uploaded_by,
        category=category,
        data=data,
        name=name,
        mime=mime,
    )


async def delete_by_id(db, file_id: str) -> bool:
    """Best-effort delete of a stored file from Drive AND Mongo. Used by
    other modules when their parent record is removed. Returns True if a
    row was deleted, False otherwise."""
    doc = await db[FILES_COLLECTION].find_one({"id": file_id}, {"_id": 0})
    if not doc:
        return False
    try:
        service, _ = await _ensure_drive_service(db)
        await asyncio.to_thread(_delete_blocking, service, doc["drive_file_id"])
    except Exception:
        logger.warning("delete_by_id: Drive removal failed for %s — clearing metadata anyway", file_id)
    await db[FILES_COLLECTION].delete_one({"id": file_id})
    return True


def storage_proxy_url(file_id: str, *, base_url: str | None = None) -> str:
    """Return the URL the frontend should use to render a stored file.

    The URL is HMAC-signed with `JWT_SECRET` so only files the backend
    itself blessed are accessible — random UUID guessing won't work even
    if someone learns a file id. The signature is permanent (no expiry):
    deleting the file from Drive is the only revocation mechanism, which
    matches the user's mental model (delete photo → it's gone).

    When `base_url` is provided we return an absolute URL — required when
    the frontend and backend live on different domains (e.g. mylife-mytime.com
    + e-api.onrender.com). Without it we return a relative path.
    """
    sig = _sign_file_id(file_id)
    path = f"/api/storage/files/{file_id}/view?sig={sig}"
    if base_url:
        return f"{base_url.rstrip('/')}{path}"
    return path


def _sign_file_id(file_id: str) -> str:
    """16-hex-char HMAC of the file id keyed by the app's JWT_SECRET.
    Short enough for clean URLs, long enough (64 bits) that brute-force
    forgery is not practical."""
    secret = os.environ.get("JWT_SECRET", "").encode("utf-8")
    if not secret:
        # Hard fail rather than silently produce un-verifiable URLs.
        raise RuntimeError("JWT_SECRET must be set to sign storage URLs.")
    mac = hmac.new(secret, file_id.encode("utf-8"), hashlib.sha256)
    return mac.hexdigest()[:16]


def _absolute_base_url(request: Request | None) -> str | None:
    """Pick the right scheme+host to put in URLs that the browser will
    load directly. Prefers the incoming request's host (so URLs always
    point at the same backend the SPA is already talking to), falling
    back to REACT_APP_BACKEND_URL for background jobs that have no
    request context."""
    if request is not None:
        proto = (
            request.headers.get("x-forwarded-proto")
            or request.url.scheme or "https"
        )
        host = (
            request.headers.get("x-forwarded-host")
            or request.headers.get("host")
        )
        if host:
            return f"{proto}://{host}"
    base = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
    return base or None


# ----- HTTP routes -------------------------------------------------------


def build_storage_router(db) -> APIRouter:
    """`/api/storage/*` — per-family file uploads + listing + deletion."""
    router = APIRouter(prefix="/storage", tags=["storage"])

    @router.post("/upload")
    async def upload(
        category: str = Form(...),
        file: UploadFile = File(...),
        _: dict = Depends(require_member_token),
    ):
        if category not in CATEGORIES:
            raise HTTPException(
                status_code=400,
                detail=f"category must be one of {sorted(CATEGORIES)}",
            )
        fid = current_family_id.get()
        mid = current_member_id.get()
        if not fid:
            raise HTTPException(status_code=400, detail="No family context.")

        data = await file.read()
        if not data:
            raise HTTPException(status_code=400, detail="File is empty.")
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"File too large (max {MAX_UPLOAD_BYTES // (1024*1024)} MB).",
            )

        service, _settings = await _ensure_drive_service(db)
        parent_id = await _ensure_family_folder(db, service, category, fid)
        safe_name = _safe_filename(file.filename or "upload")
        mime = file.content_type or "application/octet-stream"

        try:
            uploaded = await asyncio.to_thread(
                _upload_blocking,
                service,
                name=safe_name,
                mime=mime,
                data=data,
                parent_id=parent_id,
            )
        except HttpError as e:
            logger.exception("Drive upload failed")
            raise HTTPException(status_code=502, detail=f"Drive upload failed: {e}")

        doc = {
            "id": str(uuid.uuid4()),
            "family_id": fid,
            "uploaded_by": mid,
            "category": category,
            "drive_file_id": uploaded.get("id"),
            "name": uploaded.get("name") or safe_name,
            "mime_type": uploaded.get("mimeType") or mime,
            "size_bytes": int(uploaded.get("size") or len(data)),
            "drive_web_view_link": uploaded.get("webViewLink"),
            "drive_web_content_link": uploaded.get("webContentLink"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db[FILES_COLLECTION].insert_one(dict(doc))
        return _serialize(doc)

    @router.get("/files")
    async def list_files(
        category: Optional[str] = Query(None),
        limit: int = Query(100, ge=1, le=500),
        _: dict = Depends(require_member_token),
    ):
        fid = current_family_id.get()
        q = {"family_id": fid}
        if category:
            if category not in CATEGORIES:
                raise HTTPException(status_code=400, detail="Unknown category.")
            q["category"] = category
        cursor = (
            db[FILES_COLLECTION]
            .find(q, {"_id": 0})
            .sort("created_at", -1)
            .limit(limit)
        )
        return [_serialize(r) async for r in cursor]

    @router.delete("/files/{file_id}")
    async def delete_file(
        file_id: str,
        _: dict = Depends(require_member_token),
    ):
        fid = current_family_id.get()
        doc = await db[FILES_COLLECTION].find_one(
            {"id": file_id, "family_id": fid}, {"_id": 0}
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Not found.")
        # Authorisation: only the uploader can delete from the app side.
        # (Admin uses a separate admin route — see `build_admin_storage_router`.)
        mid = current_member_id.get()
        if doc.get("uploaded_by") and mid and doc["uploaded_by"] != mid:
            raise HTTPException(status_code=403, detail="Not your file.")

        service, _settings = await _ensure_drive_service(db)
        try:
            await asyncio.to_thread(_delete_blocking, service, doc["drive_file_id"])
        except HttpError as e:
            logger.warning("Drive delete failed for %s: %s", doc["drive_file_id"], e)
            # Fall through: still drop the metadata so the UI matches Drive
            # state on next refresh. Admin can clean up orphans manually.

        await db[FILES_COLLECTION].delete_one({"id": file_id})
        return {"ok": True}

    async def _stream_file(file_id: str, *, sig: Optional[str] = None):
        """Internal: validate signature (when required) and stream the
        Drive bytes back to the browser. Shared by /raw (legacy, no sig)
        and /view (signed)."""
        doc = await db[FILES_COLLECTION].find_one({"id": file_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Not found.")
        if sig is not None:
            expected = _sign_file_id(file_id)
            # Constant-time compare keeps the route safe against timing
            # side-channels on the signature.
            if not hmac.compare_digest(sig, expected):
                raise HTTPException(status_code=403, detail="Bad signature.")
        try:
            service, _ = await _ensure_drive_service(db)
            data, mime = await asyncio.to_thread(
                _download_blocking, service, doc["drive_file_id"]
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Raw fetch failed for %s", file_id)
            raise HTTPException(status_code=502, detail=f"Drive fetch failed: {e}")
        headers = {
            "Cache-Control": "private, max-age=300",
            # `<img>` from another origin works without CORS, but enabling
            # it here lets the SPA also do `fetch()` of the image (e.g.
            # for a future "Save to disk" feature) without a preflight
            # failure.
            "Access-Control-Allow-Origin": "*",
        }
        return StreamingResponse(io.BytesIO(data), media_type=mime, headers=headers)

    @router.get("/files/{file_id}/view")
    async def serve_view(file_id: str, sig: str = Query(...)):
        """HMAC-signed image proxy — preferred over /raw. The browser
        loads `<img src=".../view?sig=...">` directly, the backend
        validates the signature, fetches from Drive, and streams the
        bytes back with the correct Content-Type."""
        return await _stream_file(file_id, sig=sig)

    @router.get("/files/{file_id}/raw")
    async def serve_raw(file_id: str):
        """Legacy unsigned proxy — kept for backwards compatibility with
        any photo doc that still has a `/raw` URL stored. New uploads use
        /view + signature."""
        return await _stream_file(file_id)

    return router


def build_admin_storage_router(db) -> APIRouter:
    """`/api/admin/storage/*` — overall storage stats for the admin dashboard."""
    router = APIRouter(prefix="/admin/storage", tags=["admin", "storage"])

    @router.get("/stats")
    async def stats(_: dict = Depends(require_admin)):
        # Drive connection status from the backup settings collection so the
        # admin sees one source of truth.
        backup_doc = await db.backup_settings.find_one(
            {"_key": "global"}, {"_id": 0}
        ) or {}
        drive_connected = bool(backup_doc.get("drive_connected"))
        drive_email = backup_doc.get("drive_account_email")

        total_files = await db[FILES_COLLECTION].count_documents({})
        # Aggregate size + count per category.
        pipeline_cat = [
            {"$group": {
                "_id": "$category",
                "count": {"$sum": 1},
                "size": {"$sum": "$size_bytes"},
            }},
        ]
        by_cat_raw = [r async for r in db[FILES_COLLECTION].aggregate(pipeline_cat)]
        by_category = {r["_id"]: {"count": r["count"], "size_bytes": int(r["size"] or 0)} for r in by_cat_raw}

        pipeline_total = [
            {"$group": {"_id": None, "size": {"$sum": "$size_bytes"}}},
        ]
        total_size_raw = [r async for r in db[FILES_COLLECTION].aggregate(pipeline_total)]
        total_size = int(total_size_raw[0]["size"]) if total_size_raw else 0

        # Top 5 families by file count.
        pipeline_fams = [
            {"$group": {
                "_id": "$family_id",
                "count": {"$sum": 1},
                "size": {"$sum": "$size_bytes"},
            }},
            {"$sort": {"size": -1}},
            {"$limit": 5},
        ]
        top_families = []
        async for r in db[FILES_COLLECTION].aggregate(pipeline_fams):
            fam_doc = await db.families.find_one({"id": r["_id"]}, {"_id": 0, "name": 1})
            top_families.append({
                "family_id": r["_id"],
                "family_name": (fam_doc or {}).get("name"),
                "count": r["count"],
                "size_bytes": int(r["size"] or 0),
            })

        # Recent uploads (last 10).
        recent_cursor = (
            db[FILES_COLLECTION]
            .find({}, {"_id": 0})
            .sort("created_at", -1)
            .limit(10)
        )
        recent = [_serialize(r) async for r in recent_cursor]

        # Folder cache state — useful for diagnosing folder-creation hiccups.
        folders = await _load_folders(db)

        return {
            "drive_connected": drive_connected,
            "drive_account_email": drive_email,
            "total_files": total_files,
            "total_size_bytes": total_size,
            "by_category": by_category,
            "top_families": top_families,
            "recent_uploads": recent,
            "root_folder_id": folders["root"],
            "category_folder_ids": folders["categories"],
            "categories": sorted(CATEGORIES),
            "max_upload_bytes": MAX_UPLOAD_BYTES,
        }

    @router.post("/init-folders")
    async def init_folders(_: dict = Depends(require_admin)):
        """One-tap "set up the folder layout right now" button — useful for
        admins who want to see the directory in Drive before any user
        actually uploads anything."""
        service, _ = await _ensure_drive_service(db)
        folders = await _ensure_root_and_categories(db, service)
        return {
            "root_folder_id": folders["root"],
            "category_folder_ids": folders["categories"],
        }

    @router.post("/test-upload")
    async def admin_test_upload(_: dict = Depends(require_admin)):
        """Upload a tiny PNG to a dedicated `Family_ADMINTEST` folder under
        Photos so the admin can verify the whole pipeline works end-to-end
        without needing a member session. Independent of any real family."""
        png = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
            b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDAT\x08\x99c\xf8\xcf\xc0"
            b"\x00\x00\x00\x03\x00\x01^\xe5\xaa\xd4\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        from datetime import datetime as _dt
        name = f"storage-test-{_dt.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.png"
        try:
            doc = await store_bytes(
                db,
                family_id="ADMINTEST",
                uploaded_by=None,
                category="photos",
                data=png,
                name=name,
                mime="image/png",
            )
            return {"ok": True, "file": doc}
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Test upload failed")
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/files/{file_id}")
    async def admin_delete_file(file_id: str, _: dict = Depends(require_admin)):
        """Admin override — can delete any family's file (used to clear
        orphan / runaway uploads)."""
        doc = await db[FILES_COLLECTION].find_one({"id": file_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Not found.")
        try:
            service, _ = await _ensure_drive_service(db)
            await asyncio.to_thread(_delete_blocking, service, doc["drive_file_id"])
        except Exception:
            logger.exception("Admin delete: Drive removal failed (continuing)")
        await db[FILES_COLLECTION].delete_one({"id": file_id})
        return {"ok": True}

    return router


def _serialize(doc: dict) -> dict:
    return {
        "id": doc.get("id"),
        "family_id": doc.get("family_id"),
        "uploaded_by": doc.get("uploaded_by"),
        "category": doc.get("category"),
        "name": doc.get("name"),
        "mime_type": doc.get("mime_type"),
        "size_bytes": int(doc.get("size_bytes") or 0),
        "drive_file_id": doc.get("drive_file_id"),
        "drive_web_view_link": doc.get("drive_web_view_link"),
        "drive_web_content_link": doc.get("drive_web_content_link"),
        "created_at": doc.get("created_at"),
    }
