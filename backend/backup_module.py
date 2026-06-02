"""
System Backup module — admin-driven MongoDB → Google Drive backups.

Responsibilities:
  - Persist OAuth + scheduling settings in MongoDB (`backup_settings`).
  - Run on-demand and scheduled (APScheduler) backups of the entire current
    Mongo database (whatever `MONGO_URL` + `DB_NAME` point to).
  - Pack the dump as a single gzipped tar archive and upload it to a folder
    in the admin's personal Google Drive using a user-delegated OAuth flow
    with the narrow `drive.file` scope (only sees files this app created).
  - Keep the latest 30 backups in Drive and delete older ones automatically.
  - Record every run in `backup_runs` for the admin's history view.

This module is intentionally self-contained — it doesn't touch the rest of
the app's data model. Settings are stored under a single doc keyed by
`_key="global"` in `backup_settings`. Tokens live in the same doc.

Security notes:
  - We use `https://www.googleapis.com/auth/drive.file` only; Google never
    exposes the user's pre-existing Drive contents to us.
  - Client secret + tokens are stored in MongoDB. Admin can purge them via
    the Disconnect endpoint, which also revokes the refresh token at Google.
"""

from __future__ import annotations

import asyncio
import io
import json
import logging
import os
import tarfile
import tempfile
import uuid
from datetime import datetime, timezone
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build as build_drive
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

from auth_module import require_admin

logger = logging.getLogger(__name__)

# ----- Constants -----------------------------------------------------------

SETTINGS_KEY = "global"
SETTINGS_COLLECTION = "backup_settings"
RUNS_COLLECTION = "backup_runs"

# Bumped on every meaningful change to the OAuth flow so the /debug endpoint
# can confirm which version Render is actually running.
BUILD_VERSION = "backup-2026.06.02-3"

# Narrow scope: app can only see files it created in the user's Drive.
DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file"]

# Retention: keep the latest N archive files in Drive.
RETENTION_COUNT = 30

# Default folder name to auto-create when no folder_id is set.
DEFAULT_FOLDER_NAME = "My Life My Time Backups"

# Where temp dumps land on disk. Cleaned up automatically.
TMP_PREFIX = "mlmt-backup-"

# Default fields returned for the settings doc. Secrets are masked.
SAFE_SETTINGS_PROJECTION = {
    "_id": 0,
    "client_id": 1,
    "client_secret": 1,  # masked before return
    "folder_id": 1,
    "folder_name": 1,
    "backup_time": 1,
    "auto_enabled": 1,
    "drive_connected": 1,
    "drive_account_email": 1,
    "last_backup_at": 1,
    "last_backup_status": 1,
    "next_scheduled_at": 1,
}


# ----- Module-level state --------------------------------------------------

# Single AsyncIOScheduler shared across the whole app. We keep a handle on
# the currently-installed job so settings changes can replace it cleanly.
_scheduler: Optional[AsyncIOScheduler] = None
_scheduled_job_id = "mlmt-daily-backup"


# ----- JSON helpers --------------------------------------------------------


def _json_default(obj):
    """Pre-encode the few BSON types we expect to find in our docs so a
    `tarfile`-wrapped JSON dump never crashes on a stray ObjectId / dt."""
    if isinstance(obj, ObjectId):
        return str(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, bytes):
        # Avoid silently truncating binary; encode for round-tripping.
        try:
            return obj.decode("utf-8")
        except Exception:
            return obj.hex()
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


def _mask_secret(secret: str | None) -> str:
    """Return a UI-safe rendering of a long secret — never the raw value."""
    if not secret:
        return ""
    if len(secret) <= 8:
        return "*" * len(secret)
    return f"{secret[:4]}…{secret[-4:]}"


# ----- Settings I/O --------------------------------------------------------


async def _load_settings_raw(db) -> dict:
    """Internal: read the full settings doc including secrets/tokens."""
    doc = await db[SETTINGS_COLLECTION].find_one({"_key": SETTINGS_KEY}, {"_id": 0})
    if not doc:
        return {
            "_key": SETTINGS_KEY,
            "client_id": "",
            "client_secret": "",
            "folder_id": "",
            "folder_name": DEFAULT_FOLDER_NAME,
            "backup_time": "03:00",
            "auto_enabled": False,
            "drive_connected": False,
            "drive_account_email": None,
            "access_token": None,
            "refresh_token": None,
            "token_expiry": None,
            "scopes": [],
        }
    return doc


def _safe_settings(doc: dict) -> dict:
    """Public projection — never exposes the client_secret or tokens raw."""
    return {
        "client_id": doc.get("client_id", "") or "",
        # Mark whether a secret is set, but never return the actual chars.
        "has_client_secret": bool(doc.get("client_secret")),
        "client_secret_preview": _mask_secret(doc.get("client_secret")),
        "folder_id": doc.get("folder_id", "") or "",
        "folder_name": doc.get("folder_name") or DEFAULT_FOLDER_NAME,
        "backup_time": doc.get("backup_time") or "03:00",
        "auto_enabled": bool(doc.get("auto_enabled")),
        "drive_connected": bool(doc.get("drive_connected")),
        "drive_account_email": doc.get("drive_account_email"),
        "last_backup_at": doc.get("last_backup_at"),
        "last_backup_status": doc.get("last_backup_status"),
        "next_scheduled_at": doc.get("next_scheduled_at"),
        "retention_count": RETENTION_COUNT,
        "scope": DRIVE_SCOPES[0],
    }


# ----- Mongo dump ---------------------------------------------------------


async def _dump_database_to_tar(db, db_name: str) -> tuple[str, int, dict]:
    """Dump every collection of `db` to a single gzipped tar file. Returns
    `(file_path, size_bytes, manifest_dict)`.

    Each collection becomes a JSONL file inside the archive (`<coll>.jsonl`).
    A `manifest.json` enumerates collections + doc counts + the source db
    name + the timestamp.
    """
    started_at = datetime.now(timezone.utc)
    stamp = started_at.strftime("%Y%m%d-%H%M%S")
    archive_path = os.path.join(
        tempfile.gettempdir(), f"{TMP_PREFIX}{stamp}-{uuid.uuid4().hex[:6]}.tar.gz"
    )

    collections = await db.list_collection_names()
    collections.sort()
    manifest = {
        "version": 1,
        "database": db_name,
        "created_at": started_at.isoformat(),
        "collections": [],
    }

    # Write each collection straight into the tar to avoid copying twice.
    with tarfile.open(archive_path, mode="w:gz") as tar:
        for coll_name in collections:
            buf = io.BytesIO()
            count = 0
            async for doc in db[coll_name].find({}):
                line = json.dumps(doc, default=_json_default, ensure_ascii=False)
                buf.write((line + "\n").encode("utf-8"))
                count += 1
            data = buf.getvalue()
            info = tarfile.TarInfo(name=f"{coll_name}.jsonl")
            info.size = len(data)
            info.mtime = int(started_at.timestamp())
            tar.addfile(info, io.BytesIO(data))
            manifest["collections"].append(
                {"name": coll_name, "doc_count": count, "size_bytes": len(data)}
            )

        # Manifest last so a partial archive is detectable (missing manifest).
        man_bytes = json.dumps(manifest, indent=2, ensure_ascii=False).encode("utf-8")
        info = tarfile.TarInfo(name="manifest.json")
        info.size = len(man_bytes)
        info.mtime = int(started_at.timestamp())
        tar.addfile(info, io.BytesIO(man_bytes))

    size = os.path.getsize(archive_path)
    return archive_path, size, manifest


# ----- Google Drive helpers ----------------------------------------------


def _build_flow(client_id: str, client_secret: str, redirect_uri: str, *, lock_scopes: bool = True) -> Flow:
    """Build a google_auth_oauthlib Flow from the stored client credentials.
    Re-built per request because Flow objects aren't thread-safe.

    `lock_scopes=False` is used for the OAuth callback exchange so we can
    accept whatever Google actually granted (Google often adds `openid` +
    `userinfo.email` automatically — strict equality would fail)."""
    return Flow.from_client_config(
        {
            "web": {
                "client_id": client_id,
                "client_secret": client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [redirect_uri],
            }
        },
        scopes=DRIVE_SCOPES if lock_scopes else None,
        redirect_uri=redirect_uri,
    )


def _credentials_from_doc(doc: dict) -> Credentials:
    """Reconstruct google.oauth2.credentials.Credentials from our stored doc.
    Raises ValueError when no refresh token is present (caller decides what
    to do)."""
    if not doc.get("refresh_token"):
        raise ValueError("No refresh_token stored — Drive is not connected.")
    return Credentials(
        token=doc.get("access_token"),
        refresh_token=doc.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=doc.get("client_id"),
        client_secret=doc.get("client_secret"),
        scopes=doc.get("scopes") or DRIVE_SCOPES,
    )


async def _ensure_drive_service(db) -> tuple[object, dict]:
    """Build a Drive service, refreshing the access token if expired and
    persisting the new one. Returns (service, settings_doc)."""
    settings = await _load_settings_raw(db)
    if not settings.get("drive_connected"):
        raise HTTPException(status_code=400, detail="Google Drive is not connected.")
    creds = _credentials_from_doc(settings)
    # google-auth refreshes synchronously; wrap to keep the event loop free.
    if creds.expired and creds.refresh_token:
        await asyncio.to_thread(creds.refresh, GoogleAuthRequest())
        await db[SETTINGS_COLLECTION].update_one(
            {"_key": SETTINGS_KEY},
            {"$set": {
                "access_token": creds.token,
                "token_expiry": creds.expiry.isoformat() if creds.expiry else None,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
    service = build_drive("drive", "v3", credentials=creds, cache_discovery=False)
    return service, settings


def _ensure_folder_blocking(service, folder_id: str, folder_name: str) -> str:
    """Return a usable folder id. If `folder_id` was provided by the admin,
    verify it still exists; otherwise create (or find) a folder named
    `folder_name` in the user's My Drive root.

    Runs in a worker thread (caller wraps with `asyncio.to_thread`)."""
    if folder_id:
        try:
            meta = service.files().get(
                fileId=folder_id, fields="id, name, trashed, mimeType"
            ).execute()
            if meta.get("trashed"):
                raise HTTPException(status_code=400, detail="Folder is in trash.")
            if meta.get("mimeType") != "application/vnd.google-apps.folder":
                raise HTTPException(status_code=400, detail="folder_id is not a folder.")
            return meta["id"]
        except HttpError as e:
            raise HTTPException(status_code=400, detail=f"Folder check failed: {e}") from e

    # Otherwise auto-create / re-use by name. `drive.file` scope means we can
    # only see folders this app itself created, which is fine.
    safe = folder_name.replace("'", "\\'")
    q = (
        f"name = '{safe}' and mimeType = 'application/vnd.google-apps.folder' "
        f"and trashed = false"
    )
    listed = service.files().list(q=q, fields="files(id, name)", pageSize=10).execute()
    files = listed.get("files") or []
    if files:
        return files[0]["id"]
    created = service.files().create(
        body={
            "name": folder_name,
            "mimeType": "application/vnd.google-apps.folder",
        },
        fields="id",
    ).execute()
    return created["id"]


def _upload_blocking(service, file_path: str, folder_id: str) -> dict:
    """Upload `file_path` into `folder_id`. Returns the Drive file metadata."""
    media = MediaFileUpload(file_path, mimetype="application/gzip", resumable=True)
    body = {
        "name": os.path.basename(file_path),
        "parents": [folder_id],
        "description": "My Life My Time — automated database backup",
    }
    return service.files().create(
        body=body,
        media_body=media,
        fields="id, name, size, webViewLink, createdTime",
    ).execute()


def _enforce_retention_blocking(service, folder_id: str, keep: int) -> list[str]:
    """Delete the oldest archives once the folder has more than `keep` of
    them. Only touches `.tar.gz` files we (the app) created. Returns the
    list of file IDs that were trashed."""
    q = (
        f"'{folder_id}' in parents and trashed = false and "
        f"name contains '{TMP_PREFIX}'"
    )
    files = []
    page_token = None
    while True:
        resp = service.files().list(
            q=q,
            fields="nextPageToken, files(id, name, createdTime)",
            orderBy="createdTime desc",
            pageSize=100,
            pageToken=page_token,
        ).execute()
        files.extend(resp.get("files") or [])
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    deleted: list[str] = []
    for f in files[keep:]:
        try:
            service.files().delete(fileId=f["id"]).execute()
            deleted.append(f["id"])
        except HttpError as e:
            logger.warning("Failed to delete old backup %s: %s", f.get("name"), e)
    return deleted


# ----- Public run-backup entry point -------------------------------------


async def run_backup(db, *, trigger: str = "manual") -> dict:
    """Perform one full backup: dump → upload → retention → record. Returns
    the freshly-inserted run document.

    `trigger` is either "manual" (Backup Now) or "scheduled" (cron).
    """
    started_at = datetime.now(timezone.utc)
    run_id = str(uuid.uuid4())
    run_doc = {
        "id": run_id,
        "trigger": trigger,
        "started_at": started_at.isoformat(),
        "status": "running",
        "size_bytes": 0,
        "collections_count": 0,
        "drive_file_id": None,
        "drive_file_name": None,
        "drive_web_view_link": None,
        "error": None,
        "finished_at": None,
    }
    await db[RUNS_COLLECTION].insert_one(dict(run_doc))

    archive_path: Optional[str] = None
    try:
        # 1. Dump.
        db_name = db.name
        archive_path, size, manifest = await _dump_database_to_tar(db, db_name)
        run_doc["size_bytes"] = size
        run_doc["collections_count"] = len(manifest.get("collections", []))

        # 2. Upload.
        service, settings = await _ensure_drive_service(db)
        folder_id = await asyncio.to_thread(
            _ensure_folder_blocking,
            service,
            settings.get("folder_id") or "",
            settings.get("folder_name") or DEFAULT_FOLDER_NAME,
        )
        # If the folder was auto-created (no folder_id stored), persist it so
        # the admin sees it in the UI on next refresh.
        if not settings.get("folder_id"):
            await db[SETTINGS_COLLECTION].update_one(
                {"_key": SETTINGS_KEY},
                {"$set": {"folder_id": folder_id}},
            )
        uploaded = await asyncio.to_thread(
            _upload_blocking, service, archive_path, folder_id
        )
        run_doc["drive_file_id"] = uploaded.get("id")
        run_doc["drive_file_name"] = uploaded.get("name")
        run_doc["drive_web_view_link"] = uploaded.get("webViewLink")

        # 3. Retention.
        await asyncio.to_thread(
            _enforce_retention_blocking, service, folder_id, RETENTION_COUNT
        )

        run_doc["status"] = "success"
    except HTTPException as he:
        run_doc["status"] = "failed"
        run_doc["error"] = he.detail if isinstance(he.detail, str) else str(he.detail)
    except Exception as e:  # broad on purpose — must always finalize the row
        logger.exception("Backup run failed")
        run_doc["status"] = "failed"
        run_doc["error"] = str(e)
    finally:
        run_doc["finished_at"] = datetime.now(timezone.utc).isoformat()
        await db[RUNS_COLLECTION].update_one(
            {"id": run_id}, {"$set": run_doc}
        )
        await db[SETTINGS_COLLECTION].update_one(
            {"_key": SETTINGS_KEY},
            {"$set": {
                "last_backup_at": run_doc["finished_at"],
                "last_backup_status": run_doc["status"],
            }},
        )
        if archive_path:
            try:
                os.remove(archive_path)
            except OSError:
                pass
    return run_doc


# ----- Scheduler wiring --------------------------------------------------


def _parse_hhmm(s: str) -> tuple[int, int]:
    """Defensive parse for the admin-controlled HH:MM. Falls back to 03:00."""
    try:
        h, m = s.split(":")
        h, m = int(h), int(m)
        if 0 <= h <= 23 and 0 <= m <= 59:
            return h, m
    except Exception:
        pass
    return 3, 0


async def _reschedule(db):
    """Re-install the daily cron job using the current settings. Idempotent."""
    if _scheduler is None:
        return
    settings = await _load_settings_raw(db)
    # Drop any existing copy first so we never end up with duplicates.
    try:
        _scheduler.remove_job(_scheduled_job_id)
    except Exception:
        pass
    if not settings.get("auto_enabled") or not settings.get("drive_connected"):
        await db[SETTINGS_COLLECTION].update_one(
            {"_key": SETTINGS_KEY}, {"$set": {"next_scheduled_at": None}}
        )
        return
    h, m = _parse_hhmm(settings.get("backup_time") or "03:00")
    trigger = CronTrigger(hour=h, minute=m, timezone="UTC")
    job = _scheduler.add_job(
        _scheduled_run,
        trigger=trigger,
        id=_scheduled_job_id,
        args=[db],
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    nrt = job.next_run_time.isoformat() if job.next_run_time else None
    await db[SETTINGS_COLLECTION].update_one(
        {"_key": SETTINGS_KEY}, {"$set": {"next_scheduled_at": nrt}}
    )


async def _scheduled_run(db):
    """Top-level coroutine APScheduler fires every day at the configured
    HH:MM (UTC). Wrapped in its own try/except so a backup failure can never
    crash the scheduler thread."""
    try:
        logger.info("[backup] scheduled run starting")
        await run_backup(db, trigger="scheduled")
    except Exception:
        logger.exception("[backup] scheduled run crashed")


def start_scheduler(db) -> None:
    """Called once on FastAPI startup. Idempotent — safe to call twice (the
    second call is a no-op so the dev hot-reload doesn't spawn duplicates)."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        return
    sched = AsyncIOScheduler(timezone="UTC")
    sched.start()
    _scheduler = sched
    # Install the job using whatever settings already exist in the DB.
    asyncio.create_task(_reschedule(db))


# ----- HTTP routes -------------------------------------------------------


def build_backup_router(db) -> APIRouter:
    """Return a FastAPI router mounted under `/api/admin/backup`."""
    router = APIRouter(prefix="/admin/backup", tags=["admin", "backup"])

    @router.get("/settings")
    async def get_settings(_: dict = Depends(require_admin)):
        doc = await _load_settings_raw(db)
        return _safe_settings(doc)

    @router.put("/settings")
    async def put_settings(body: dict, _: dict = Depends(require_admin)):
        """Save admin-entered fields. Only the keys the admin actually
        submits are touched — never overwrites OAuth tokens here."""
        allowed = ["client_id", "client_secret", "folder_id", "folder_name",
                   "backup_time", "auto_enabled"]
        update = {}
        for k in allowed:
            if k in body and body[k] is not None:
                if k == "auto_enabled":
                    update[k] = bool(body[k])
                else:
                    update[k] = str(body[k]).strip()
        # Allow the admin to clear the client_secret without leaking the old
        # one — they have to submit an empty string explicitly. To avoid
        # accidental wipes (UI sends an empty masked field), only overwrite
        # when the new value is non-empty OR explicitly null.
        if "client_secret" in body:
            v = body.get("client_secret")
            if v is None or v == "":
                # Drop the field entirely when explicitly cleared
                if body.get("_clear_secret"):
                    update["client_secret"] = ""
                else:
                    update.pop("client_secret", None)
            else:
                update["client_secret"] = str(v).strip()
        update["updated_at"] = datetime.now(timezone.utc).isoformat()

        # If the client_id changed, the existing OAuth token is no longer
        # valid for it — force a fresh re-connect.
        existing = await _load_settings_raw(db)
        if (
            "client_id" in update
            and existing.get("drive_connected")
            and update["client_id"] != existing.get("client_id")
        ):
            update.update({
                "drive_connected": False,
                "drive_account_email": None,
                "access_token": None,
                "refresh_token": None,
                "token_expiry": None,
                "scopes": [],
            })

        await db[SETTINGS_COLLECTION].update_one(
            {"_key": SETTINGS_KEY},
            {"$set": update, "$setOnInsert": {"_key": SETTINGS_KEY}},
            upsert=True,
        )
        await _reschedule(db)
        fresh = await _load_settings_raw(db)
        return _safe_settings(fresh)

    @router.post("/test-connection")
    async def test_connection(_: dict = Depends(require_admin)):
        """Verify the current settings can actually talk to Drive. We
        purposely list `/about` (not /files) so the test works the moment a
        refresh-token is granted, regardless of folder configuration."""
        try:
            service, settings = await _ensure_drive_service(db)
            about = await asyncio.to_thread(
                lambda: service.about().get(fields="user").execute()
            )
            email = (about.get("user") or {}).get("emailAddress")
            # Also verify the folder if one was configured.
            folder_ok = True
            folder_msg = None
            if settings.get("folder_id"):
                try:
                    await asyncio.to_thread(
                        lambda: service.files().get(
                            fileId=settings["folder_id"],
                            fields="id, name, trashed, mimeType",
                        ).execute()
                    )
                except HttpError as e:
                    folder_ok = False
                    folder_msg = f"Folder check failed: {e}"
            return {
                "ok": True,
                "account_email": email,
                "scope": DRIVE_SCOPES[0],
                "folder_ok": folder_ok,
                "folder_message": folder_msg,
            }
        except HTTPException as he:
            raise he
        except Exception as e:
            logger.exception("Drive test failed")
            raise HTTPException(status_code=400, detail=str(e))

    @router.get("/debug")
    async def debug(request: Request, _: dict = Depends(require_admin)):
        """Diagnostic info — confirms which version is actually deployed and
        what `redirect_uri` the backend will send to Google. Use this from
        the browser when troubleshooting OAuth errors:
            GET /api/admin/backup/debug
        """
        settings = await _load_settings_raw(db)
        return {
            "build": BUILD_VERSION,
            "host": request.headers.get("host"),
            "redirect_uri": _redirect_uri(request),
            "pkce_enabled": False,
            "auth_endpoint": "https://accounts.google.com/o/oauth2/v2/auth",
            "token_endpoint": "https://oauth2.googleapis.com/token",
            "scope": DRIVE_SCOPES[0],
            "stored": {
                "client_id": settings.get("client_id") or "",
                "has_client_secret": bool(settings.get("client_secret")),
                "drive_connected": bool(settings.get("drive_connected")),
                "drive_account_email": settings.get("drive_account_email"),
                "oauth_state_set": bool(settings.get("oauth_state")),
                "oauth_redirect_uri_stored": settings.get("oauth_redirect_uri"),
            },
        }

    @router.get("/oauth/start")
    async def oauth_start(request: Request, _: dict = Depends(require_admin)):
        """Return the Google consent URL. We require the admin to save
        client_id + client_secret first."""
        settings = await _load_settings_raw(db)
        if not settings.get("client_id") or not settings.get("client_secret"):
            raise HTTPException(
                status_code=400,
                detail="Save Google Client ID and Client Secret first.",
            )
        redirect_uri = _redirect_uri(request)
        state = uuid.uuid4().hex

        # Build the authorization URL ENTIRELY by hand — no
        # `google_auth_oauthlib.Flow` involved. This guarantees we never
        # leak a `code_challenge` parameter that we don't intend to support
        # (different versions of the library default differently). We are a
        # confidential web client (we hold the secret), so PKCE is optional
        # under RFC 6749 §4.1 — we simply don't request it.
        from urllib.parse import urlencode
        params = {
            "response_type": "code",
            "client_id": settings["client_id"],
            "redirect_uri": redirect_uri,
            "scope": " ".join(DRIVE_SCOPES),
            "state": state,
            "access_type": "offline",
            "include_granted_scopes": "true",
            "prompt": "consent",
        }
        auth_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)

        # Diagnostic log so the deploy version is unambiguous in Render logs.
        logger.info(
            "[backup oauth] build=%s host=%s redirect_uri=%s pkce=False auth_url=%s",
            BUILD_VERSION,
            request.headers.get("host"),
            redirect_uri,
            auth_url,
        )
        await db[SETTINGS_COLLECTION].update_one(
            {"_key": SETTINGS_KEY},
            {"$set": {
                "oauth_state": state,
                "oauth_code_verifier": None,
                "oauth_redirect_uri": redirect_uri,
            }},
        )
        return {
            "authorization_url": auth_url,
            "redirect_uri": redirect_uri,
            "build": BUILD_VERSION,
            "pkce": False,
        }

    @router.get("/oauth/callback")
    async def oauth_callback(
        request: Request,
        code: str = Query(...),
        state: str = Query(...),
    ):
        """Google redirects here after the admin grants consent. This route
        is intentionally NOT behind `require_admin` (Google's redirect is an
        unauthenticated browser navigation). We verify the random `state`
        instead — only a request initiated from our own /oauth/start gets
        through.

        Token exchange is done with a direct HTTP POST to Google's token
        endpoint (instead of `google_auth_oauthlib.Flow.fetch_token`) so we
        can surface Google's literal error response on failure. The library
        wraps responses in opaque exception strings like "Bad Request" that
        hide the real `error_description` field.
        """
        import requests
        settings = await _load_settings_raw(db)
        if not settings.get("oauth_state") or settings["oauth_state"] != state:
            raise HTTPException(status_code=400, detail="Invalid OAuth state.")
        if not settings.get("client_id") or not settings.get("client_secret"):
            raise HTTPException(status_code=400, detail="Client credentials missing.")
        # Idempotency: if we already finished this exchange (browser pre-fetched
        # the redirect or the user hit Back/Forward), don't re-redeem the code.
        if settings.get("oauth_consumed_code") == code and settings.get("drive_connected"):
            return _post_callback_redirect(request)
        redirect_uri = settings.get("oauth_redirect_uri") or _redirect_uri(request)

        # Manual exchange — gives us the raw Google error_description.
        logger.info(
            "[backup oauth] callback build=%s host=%s redirect_uri=%s code_len=%s",
            BUILD_VERSION,
            request.headers.get("host"),
            redirect_uri,
            len(code) if code else 0,
        )
        try:
            resp = await asyncio.to_thread(
                lambda: requests.post(
                    "https://oauth2.googleapis.com/token",
                    data={
                        "code": code,
                        "client_id": settings["client_id"],
                        "client_secret": settings["client_secret"],
                        "redirect_uri": redirect_uri,
                        "grant_type": "authorization_code",
                    },
                    timeout=15,
                )
            )
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"OAuth network error: {e}")
        if resp.status_code != 200:
            # Surface Google's `error` + `error_description` verbatim.
            try:
                err = resp.json()
                msg = f"{err.get('error', 'oauth_error')}: {err.get('error_description') or resp.text}"
            except Exception:
                msg = resp.text or f"HTTP {resp.status_code}"
            logger.error("Token exchange failed: %s", msg)
            raise HTTPException(status_code=400, detail=f"OAuth exchange failed: {msg}")
        payload = resp.json()
        access_token = payload.get("access_token")
        refresh_token = payload.get("refresh_token")
        expires_in = payload.get("expires_in") or 0
        scope_str = payload.get("scope") or ""
        granted = set(scope_str.split())

        if not access_token:
            raise HTTPException(status_code=400, detail="No access token in response.")
        if DRIVE_SCOPES[0] not in granted:
            raise HTTPException(
                status_code=400,
                detail=f"Drive scope not granted. Got: {sorted(granted)}",
            )
        # Build Credentials manually so the rest of the module keeps working.
        from datetime import timedelta
        expiry_iso = (datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))).isoformat()
        creds = Credentials(
            token=access_token,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=settings["client_id"],
            client_secret=settings["client_secret"],
            scopes=list(granted),
        )
        # Pull the account email so we can show it in the UI.
        email = None
        try:
            service = build_drive("drive", "v3", credentials=creds, cache_discovery=False)
            about = await asyncio.to_thread(
                lambda: service.about().get(fields="user").execute()
            )
            email = (about.get("user") or {}).get("emailAddress")
        except Exception:
            pass
        await db[SETTINGS_COLLECTION].update_one(
            {"_key": SETTINGS_KEY},
            {"$set": {
                "drive_connected": True,
                "drive_account_email": email,
                "access_token": creds.token,
                "refresh_token": creds.refresh_token,
                "token_expiry": expiry_iso,
                "scopes": list(granted),
                "oauth_state": None,
                "oauth_code_verifier": None,
                "oauth_redirect_uri": None,
                "oauth_consumed_code": code,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        # Pick up the auto_enabled flag now that we have tokens.
        await _reschedule(db)
        return _post_callback_redirect(request)

    @router.post("/oauth/disconnect")
    async def oauth_disconnect(_: dict = Depends(require_admin)):
        """Forget the stored tokens and (best-effort) revoke them at Google."""
        settings = await _load_settings_raw(db)
        refresh = settings.get("refresh_token")
        if refresh:
            try:
                creds = _credentials_from_doc(settings)
                # google-auth doesn't ship a high-level revoke; hit the
                # documented endpoint directly.
                import requests
                await asyncio.to_thread(
                    lambda: requests.post(
                        "https://oauth2.googleapis.com/revoke",
                        params={"token": creds.refresh_token},
                        headers={"content-type": "application/x-www-form-urlencoded"},
                        timeout=10,
                    )
                )
            except Exception:
                logger.warning("Drive token revoke failed (continuing anyway)")
        await db[SETTINGS_COLLECTION].update_one(
            {"_key": SETTINGS_KEY},
            {"$set": {
                "drive_connected": False,
                "drive_account_email": None,
                "access_token": None,
                "refresh_token": None,
                "token_expiry": None,
                "scopes": [],
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        await _reschedule(db)
        return {"ok": True}

    @router.post("/run")
    async def trigger_backup(_: dict = Depends(require_admin)):
        run = await run_backup(db, trigger="manual")
        return _serialize_run(run)

    @router.get("/history")
    async def history(_: dict = Depends(require_admin)):
        cursor = db[RUNS_COLLECTION].find(
            {}, {"_id": 0}
        ).sort("started_at", -1).limit(100)
        items = [r async for r in cursor]
        return [_serialize_run(r) for r in items]

    return router


def _redirect_uri(request: Request | None = None) -> str:
    """Build the OAuth redirect URI from the public host that's actually
    serving the current request. This avoids forcing the admin to hard-code
    the backend URL in env vars. Falls back to REACT_APP_BACKEND_URL when
    we have no request context (e.g. background jobs)."""
    if request is not None:
        # Honour proxy headers — Kubernetes ingress sets X-Forwarded-* so
        # we land on the public hostname, not the internal cluster IP.
        proto = (
            request.headers.get("x-forwarded-proto")
            or request.url.scheme
            or "https"
        )
        host = (
            request.headers.get("x-forwarded-host")
            or request.headers.get("host")
        )
        if host:
            return f"{proto}://{host}/api/admin/backup/oauth/callback"
    base = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
    if not base:
        raise HTTPException(
            status_code=500,
            detail="Cannot determine backend public URL for OAuth redirect.",
        )
    return f"{base}/api/admin/backup/oauth/callback"


def _post_callback_redirect(request: Request) -> RedirectResponse:
    """Send the admin's browser back to `/admin?drive_connected=1` on the
    same public host that just hit /oauth/callback."""
    proto = (
        request.headers.get("x-forwarded-proto")
        or request.url.scheme or "https"
    )
    host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    if host:
        front = f"{proto}://{host}"
    else:
        front = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
    return RedirectResponse(url=f"{front}/admin?drive_connected=1", status_code=302)


def _serialize_run(r: dict) -> dict:
    return {
        "id": r.get("id"),
        "trigger": r.get("trigger"),
        "started_at": r.get("started_at"),
        "finished_at": r.get("finished_at"),
        "status": r.get("status"),
        "size_bytes": int(r.get("size_bytes") or 0),
        "collections_count": int(r.get("collections_count") or 0),
        "drive_file_name": r.get("drive_file_name"),
        "drive_web_view_link": r.get("drive_web_view_link"),
        "error": r.get("error"),
    }
