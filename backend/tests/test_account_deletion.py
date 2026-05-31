"""End-to-end regression for the GDPR account deletion flow.

Covers:
- POST /api/account/request-delete with wrong phrase   → 400
- POST /api/account/request-delete with wrong password → 401
- POST /api/account/request-delete success             → 200 + status flipped
- After request, the deletion-status endpoint returns the schedule
- After request, data routes return 423 Locked
- Login returns `pending_deletion=true` flag
- POST /api/account/cancel-delete                      → 200 + status active
- After cancel, data routes work again
- Localized confirmation phrases (DELETE / حذف / LÖSCHEN) all accepted
- Audit row written on permanent purge
"""

import os
import time
import asyncio
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


def _register(account_type="single", email_suffix=""):
    ts = f"{int(time.time()*1000)}{email_suffix}"
    payload = {
        "family_name": "Delete Test",
        "email": f"del-{ts}@example.com",
        "password": "Pass1234!",
        "confirm_password": "Pass1234!",
        "account_type": account_type,
        "accepted_beta_terms": True,
        "accepted_privacy_policy": True,
        "accepted_disclaimer": True,
    }
    r = requests.post(f"{API}/auth/register", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    return data, payload["email"], payload["password"]


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_request_delete_wrong_phrase_returns_400():
    data, _, password = _register(email_suffix="-a")
    r = requests.post(
        f"{API}/account/request-delete",
        json={"password": password, "confirm": "nope"},
        headers=_auth_headers(data["access_token"]),
        timeout=15,
    )
    assert r.status_code == 400, r.text
    assert "phrase" in r.text.lower()


def test_request_delete_wrong_password_returns_401():
    data, _, _ = _register(email_suffix="-b")
    r = requests.post(
        f"{API}/account/request-delete",
        json={"password": "WrongPass!", "confirm": "DELETE"},
        headers=_auth_headers(data["access_token"]),
        timeout=15,
    )
    assert r.status_code == 401, r.text


def test_request_delete_success_locks_account_and_data_routes():
    data, _, password = _register(email_suffix="-c")
    acc_token = data["access_token"]
    # Sanity: a member token can list family members BEFORE deletion.
    r0 = requests.get(
        f"{API}/family/members",
        headers=_auth_headers(data["member_token"]),
        timeout=15,
    )
    assert r0.status_code == 200, r0.text

    # 1) Request deletion.
    r = requests.post(
        f"{API}/account/request-delete",
        json={"password": password, "confirm": "DELETE"},
        headers=_auth_headers(acc_token),
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["scheduled_permanent_delete_at"]
    assert body["grace_days"] == 30
    # Schedule should be 30 days in the future (±1h tolerance).
    sched = datetime.fromisoformat(body["scheduled_permanent_delete_at"])
    expected = datetime.now(timezone.utc) + timedelta(days=30)
    assert abs((sched - expected).total_seconds()) < 3600

    # 2) deletion-status reports the new state.
    rs = requests.get(
        f"{API}/account/deletion-status",
        headers=_auth_headers(acc_token),
        timeout=15,
    )
    assert rs.status_code == 200
    assert rs.json()["status"] == "deletion_requested"

    # 3) A typical data route is now locked (423).
    rd = requests.get(
        f"{API}/wall/notes",
        headers=_auth_headers(data["member_token"]),
        timeout=15,
    )
    assert rd.status_code == 423, rd.text


def test_login_returns_pending_deletion_flag():
    data, email, password = _register(email_suffix="-d")
    requests.post(
        f"{API}/account/request-delete",
        json={"password": password, "confirm": "DELETE"},
        headers=_auth_headers(data["access_token"]),
        timeout=15,
    )
    # New login.
    r = requests.post(
        f"{API}/auth/login",
        json={"email": email, "password": password},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("pending_deletion") is True
    # No member_token issued when pending deletion.
    assert "member_token" not in body
    assert body.get("scheduled_permanent_delete_at")


def test_cancel_delete_restores_access():
    data, email, password = _register(email_suffix="-e")
    requests.post(
        f"{API}/account/request-delete",
        json={"password": password, "confirm": "DELETE"},
        headers=_auth_headers(data["access_token"]),
        timeout=15,
    )
    # Cancel using the still-valid account token.
    r = requests.post(
        f"{API}/account/cancel-delete",
        headers=_auth_headers(data["access_token"]),
        timeout=15,
    )
    assert r.status_code == 200, r.text

    # New login should work normally (single → both tokens returned).
    rl = requests.post(
        f"{API}/auth/login",
        json={"email": email, "password": password},
        timeout=15,
    )
    body = rl.json()
    assert not body.get("pending_deletion")
    assert body.get("member_token"), "member_token should be re-issued after cancel"

    # Data routes are unlocked.
    rd = requests.get(
        f"{API}/wall/notes",
        headers=_auth_headers(body["member_token"]),
        timeout=15,
    )
    assert rd.status_code == 200, rd.text


def test_localized_confirmation_phrases_accepted():
    for suffix, phrase in (("-f", "حذف"), ("-g", "LÖSCHEN"), ("-h", "delete")):
        data, _, password = _register(email_suffix=suffix)
        r = requests.post(
            f"{API}/account/request-delete",
            json={"password": password, "confirm": phrase},
            headers=_auth_headers(data["access_token"]),
            timeout=15,
        )
        assert r.status_code == 200, f"phrase={phrase} body={r.text}"


def test_idempotent_request_returns_existing_schedule():
    data, _, password = _register(email_suffix="-i")
    r1 = requests.post(
        f"{API}/account/request-delete",
        json={"password": password, "confirm": "DELETE"},
        headers=_auth_headers(data["access_token"]),
        timeout=15,
    )
    sched1 = r1.json()["scheduled_permanent_delete_at"]
    r2 = requests.post(
        f"{API}/account/request-delete",
        json={"password": password, "confirm": "DELETE"},
        headers=_auth_headers(data["access_token"]),
        timeout=15,
    )
    body2 = r2.json()
    assert body2["already_requested"] is True
    assert body2["scheduled_permanent_delete_at"] == sched1


def test_permanent_purge_wipes_data_and_writes_audit():
    """Force the scheduled time into the past, run the purge once, verify
    the family + account are gone and an audit row exists."""
    from motor.motor_asyncio import AsyncIOMotorClient
    from dotenv import load_dotenv
    import sys
    sys.path.insert(0, "/app/backend")
    load_dotenv("/app/backend/.env")

    data, _, password = _register(email_suffix="-j")
    # Add a wall note so the purge has something to delete.
    requests.post(
        f"{API}/wall/notes",
        json={"text": "delete me", "color": "#fff"},
        headers=_auth_headers(data["member_token"]),
        timeout=15,
    )
    # Request deletion.
    requests.post(
        f"{API}/account/request-delete",
        json={"password": password, "confirm": "DELETE"},
        headers=_auth_headers(data["access_token"]),
        timeout=15,
    )
    account_id = data["account"]["id"]
    family_id = data["family"]["id"]

    async def _run():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        rdb = client[os.environ["DB_NAME"]]
        # Force the schedule into the past, then run a single purge pass.
        await rdb.accounts.update_one(
            {"id": account_id},
            {"$set": {
                "scheduled_permanent_delete_at": (
                    datetime.now(timezone.utc) - timedelta(hours=1)
                ).isoformat(),
            }},
        )
        from server import _purge_overdue_deletions
        await _purge_overdue_deletions()
        # Verify everything is gone.
        acc = await rdb.accounts.find_one({"id": account_id})
        fam = await rdb.families.find_one({"id": family_id})
        notes_count = await rdb.wall_notes.count_documents({"family_id": family_id})
        audit = await rdb.deletion_audit.find_one({"account_id": account_id})
        client.close()
        return acc, fam, notes_count, audit

    acc, fam, notes_count, audit = asyncio.get_event_loop().run_until_complete(_run())
    assert acc is None, "account should be purged"
    assert fam is None, "family should be purged"
    assert notes_count == 0, "wall notes should be purged"
    assert audit is not None, "audit row should exist"
    assert audit["reason"] == "user_request"
    assert audit["hashed_email"], "hashed_email must be present in audit"
    # Audit must NOT contain plaintext email.
    assert "@" not in audit["hashed_email"]
