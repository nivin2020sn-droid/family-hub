"""End-to-end smoke tests for the System Backup admin module.

We don't exercise the real Google Drive API — that would require a live
refresh token. Instead we verify the routes' contract: settings round-trip,
secret masking, scheduler rescheduling, OAuth-start URL generation, and the
"Backup Now" path produces a `failed` run when Drive isn't connected (still
proving the dump pipeline runs without raising).
"""

import os
import re

import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE}/api"
ADMIN_EMAIL = os.environ.get("BACKUP_TEST_ADMIN_EMAIL", "bsn.1988@hotmail.com")
ADMIN_PASS = os.environ.get("BACKUP_TEST_ADMIN_PASS", "11qqQQ!!")


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
        timeout=15,
    )
    r.raise_for_status()
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


def _reset(headers):
    """Wipe any previously stored settings/runs to keep tests isolated."""
    # This module only has its own collections; clear them via a save+wipe.
    requests.put(f"{API}/admin/backup/settings", headers=headers, json={
        "client_id": "",
        "client_secret": "",
        "_clear_secret": True,
        "folder_id": "",
        "backup_time": "03:00",
        "auto_enabled": False,
    }, timeout=10)


def test_initial_settings_are_blank(headers):
    _reset(headers)
    r = requests.get(f"{API}/admin/backup/settings", headers=headers, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["client_id"] == ""
    assert body["has_client_secret"] is False
    assert body["drive_connected"] is False
    assert body["retention_count"] == 30
    assert body["scope"] == "https://www.googleapis.com/auth/drive.file"


def test_save_settings_masks_secret(headers):
    payload = {
        "client_id": "xxx.apps.googleusercontent.com",
        "client_secret": "GOCSPX-supersecret-value",
        "folder_id": "abc123",
        "backup_time": "04:15",
        "auto_enabled": False,
    }
    r = requests.put(f"{API}/admin/backup/settings", headers=headers, json=payload, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["client_id"] == payload["client_id"]
    assert body["has_client_secret"] is True
    # Preview must NOT contain the raw secret in the clear.
    assert payload["client_secret"] not in body["client_secret_preview"]
    assert body["folder_id"] == "abc123"
    assert body["backup_time"] == "04:15"


def test_partial_save_does_not_wipe_secret(headers):
    # First, save a known secret.
    requests.put(f"{API}/admin/backup/settings", headers=headers, json={
        "client_id": "xxx.apps.googleusercontent.com",
        "client_secret": "GOCSPX-keeper",
    }, timeout=10)
    # Now patch unrelated fields — the secret must survive.
    r = requests.put(f"{API}/admin/backup/settings", headers=headers, json={
        "backup_time": "05:00",
    }, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["has_client_secret"] is True
    assert body["backup_time"] == "05:00"


def test_oauth_start_blocks_without_credentials(headers):
    _reset(headers)
    r = requests.get(f"{API}/admin/backup/oauth/start", headers=headers, timeout=10)
    assert r.status_code == 400
    assert "client" in r.json()["detail"].lower()


def test_oauth_start_returns_consent_url(headers):
    requests.put(f"{API}/admin/backup/settings", headers=headers, json={
        "client_id": "fake.apps.googleusercontent.com",
        "client_secret": "GOCSPX-fake",
    }, timeout=10)
    r = requests.get(f"{API}/admin/backup/oauth/start", headers=headers, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["authorization_url"].startswith("https://accounts.google.com/o/oauth2/auth")
    assert "scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.file" in body["authorization_url"]
    assert "access_type=offline" in body["authorization_url"]
    assert "prompt=consent" in body["authorization_url"]
    assert re.search(r"redirect_uri=[^&]+%2Fapi%2Fadmin%2Fbackup%2Foauth%2Fcallback", body["authorization_url"])


def test_test_connection_requires_drive_connected(headers):
    r = requests.post(f"{API}/admin/backup/test-connection", headers=headers, timeout=10)
    assert r.status_code == 400
    assert "not connected" in r.json()["detail"].lower()


def test_backup_now_runs_dump_but_fails_without_drive(headers):
    """The pipeline must always finalize a row in history, even when the
    Drive step fails — proves the dump + JSON encoder don't crash on real
    BSON data in the live database."""
    r = requests.post(f"{API}/admin/backup/run", headers=headers, timeout=60)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "failed"
    # The dump itself must have succeeded (size > 0, collections counted).
    assert body["size_bytes"] > 0
    assert body["collections_count"] > 0
    assert "drive" in (body["error"] or "").lower()


def test_history_lists_latest_first(headers):
    r = requests.get(f"{API}/admin/backup/history", headers=headers, timeout=10)
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    assert len(items) >= 1
    # Newest first.
    if len(items) >= 2:
        assert items[0]["started_at"] >= items[1]["started_at"]


def test_scheduler_reschedules_on_settings_save(headers):
    """Enabling auto_enabled while NOT connected must NOT install a job
    (nothing to do). The settings doc reflects that as `next_scheduled_at:
    null`."""
    r = requests.put(f"{API}/admin/backup/settings", headers=headers, json={
        "auto_enabled": True,
        "backup_time": "02:00",
    }, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["auto_enabled"] is True
    assert body["drive_connected"] is False
    assert body["next_scheduled_at"] is None
