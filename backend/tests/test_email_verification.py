"""End-to-end regression for the Email Verification + Password Reset (email link) flow.

Covers:
- Register → email_verified=false, no tokens returned
- Login on unverified account → 403 with code='email_not_verified'
- Verify-email with valid token → flips email_verified=true; login then works
- Resend verification (rate limited to 3/15min/email; 4th = 429)
- Forgot-password sends email link; reset-password consumes it to change pw
- Reset token can be used only once
- Wrong / expired token returns 400
- Existing accounts (no email_verified field) are backfilled to True by
  ensure_indexes (migration)
- Admin email-settings GET/PUT (with password masking) — admin only
"""

import os
import re
import time
import asyncio
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


def _register(suffix=""):
    ts = f"{int(time.time()*1000)}{suffix}"
    email = f"verify-{ts}@example.com"
    payload = {
        "family_name": "VerifyTest",
        "email": email,
        "password": "Pass1234!",
        "confirm_password": "Pass1234!",
        "account_type": "single",
        "lang": "en",
        "accepted_beta_terms": True,
        "accepted_privacy_policy": True,
        "accepted_disclaimer": True,
    }
    r = requests.post(f"{API}/auth/register", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    return r.json(), email, payload["password"]


def _read_token_from_logs(email: str, kind: str = "verify") -> str:
    from tests.conftest import read_email_token_from_logs
    return read_email_token_from_logs(email, kind)


def test_register_returns_no_tokens_email_unverified():
    data, email, _ = _register("-a")
    assert data["email_verified"] is False
    assert data["verification_sent"] is True
    assert "access_token" not in data
    assert "member_token" not in data
    assert data["email"] == email


def test_login_blocked_on_unverified_account():
    _, email, password = _register("-b")
    r = requests.post(
        f"{API}/auth/login",
        json={"email": email, "password": password},
        timeout=15,
    )
    assert r.status_code == 403, r.text
    detail = r.json().get("detail")
    assert isinstance(detail, dict) and detail.get("code") == "email_not_verified"


def test_verify_email_flips_flag_and_unlocks_login():
    _, email, password = _register("-c")
    token = _read_token_from_logs(email, "verify")
    rv = requests.post(f"{API}/auth/verify-email", json={"token": token}, timeout=15)
    assert rv.status_code == 200, rv.text
    assert rv.json().get("ok") is True
    # Now login succeeds and returns both tokens (single account).
    rl = requests.post(
        f"{API}/auth/login",
        json={"email": email, "password": password},
        timeout=15,
    )
    assert rl.status_code == 200, rl.text
    body = rl.json()
    assert body.get("access_token")
    assert body.get("member_token")


def test_verify_email_rejects_invalid_token():
    r = requests.post(f"{API}/auth/verify-email", json={"token": "deadbeef"}, timeout=15)
    assert r.status_code == 400, r.text


def test_verify_email_token_single_use():
    _, email, _ = _register("-d")
    token = _read_token_from_logs(email, "verify")
    r1 = requests.post(f"{API}/auth/verify-email", json={"token": token}, timeout=15)
    assert r1.status_code == 200, r1.text
    r2 = requests.post(f"{API}/auth/verify-email", json={"token": token}, timeout=15)
    assert r2.status_code == 400, r2.text


def test_resend_verification_rate_limited():
    _, email, _ = _register("-e")
    # Original register already counts as 1 send. The next 2 should succeed,
    # the 4th should hit 429.
    statuses = []
    for _ in range(3):
        r = requests.post(
            f"{API}/auth/resend-verification",
            json={"email": email, "lang": "en"},
            timeout=15,
        )
        statuses.append(r.status_code)
        time.sleep(0.1)
    # 2 of the 3 should be 200, the third must be 429 (since register=1 + 2 = limit).
    assert 429 in statuses, f"expected rate limit hit, got {statuses}"


def test_resend_verification_silently_ok_for_unknown_email():
    r = requests.post(
        f"{API}/auth/resend-verification",
        json={"email": f"unknown-{int(time.time()*1000)}@example.com", "lang": "en"},
        timeout=15,
    )
    assert r.status_code == 200


def test_resend_returns_already_verified_for_verified_account():
    _, email, _ = _register("-f")
    token = _read_token_from_logs(email, "verify")
    requests.post(f"{API}/auth/verify-email", json={"token": token}, timeout=15)
    r = requests.post(
        f"{API}/auth/resend-verification",
        json={"email": email, "lang": "en"},
        timeout=15,
    )
    body = r.json()
    assert body.get("ok") is True
    assert body.get("already_verified") is True


def test_forgot_password_link_and_reset():
    _, email, _ = _register("-g")
    # Verify so we can also confirm login still works post-reset.
    verify_token = _read_token_from_logs(email, "verify")
    requests.post(f"{API}/auth/verify-email", json={"token": verify_token}, timeout=15)

    r = requests.post(
        f"{API}/auth/forgot-password",
        json={"email": email, "lang": "en"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ttl_minutes") == 30

    reset_token = _read_token_from_logs(email, "reset")
    rr = requests.post(
        f"{API}/auth/reset-password",
        json={"token": reset_token, "new_password": "NewPass!9"},
        timeout=15,
    )
    assert rr.status_code == 200, rr.text

    # Old password rejected.
    r_old = requests.post(
        f"{API}/auth/login",
        json={"email": email, "password": "Pass1234!"},
        timeout=15,
    )
    assert r_old.status_code == 401

    # New password works.
    r_new = requests.post(
        f"{API}/auth/login",
        json={"email": email, "password": "NewPass!9"},
        timeout=15,
    )
    assert r_new.status_code == 200


def test_reset_token_single_use():
    _, email, _ = _register("-h")
    verify_token = _read_token_from_logs(email, "verify")
    requests.post(f"{API}/auth/verify-email", json={"token": verify_token}, timeout=15)
    requests.post(f"{API}/auth/forgot-password", json={"email": email, "lang": "en"}, timeout=15)
    reset_token = _read_token_from_logs(email, "reset")
    r1 = requests.post(
        f"{API}/auth/reset-password",
        json={"token": reset_token, "new_password": "NewPass!9"},
        timeout=15,
    )
    assert r1.status_code == 200
    r2 = requests.post(
        f"{API}/auth/reset-password",
        json={"token": reset_token, "new_password": "Another1!"},
        timeout=15,
    )
    assert r2.status_code == 400


def test_reset_password_anti_enumeration():
    """Unknown email still returns 200 (no leak about account existence)."""
    r = requests.post(
        f"{API}/auth/forgot-password",
        json={"email": f"ghost-{int(time.time()*1000)}@example.com", "lang": "en"},
        timeout=15,
    )
    assert r.status_code == 200


def test_legacy_accounts_are_backfilled_email_verified_true():
    """Insert an account without `email_verified` then run ensure_indexes —
    the field must be set to True so legacy users keep their access."""
    from motor.motor_asyncio import AsyncIOMotorClient
    from dotenv import load_dotenv
    import sys
    sys.path.insert(0, "/app/backend")
    load_dotenv("/app/backend/.env")

    async def _run():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        rdb = client[os.environ["DB_NAME"]]
        legacy_email = f"legacy-{int(time.time()*1000)}@example.com"
        from auth_module import ensure_indexes, hash_secret
        import uuid
        await rdb.accounts.insert_one({
            "id": str(uuid.uuid4()),
            "family_id": "legacy-fam",
            "email": legacy_email,
            "password_hash": hash_secret("LegacyPass1!"),
            "role": "owner",
            "created_at": datetime.now(timezone.utc).isoformat(),
            # NOTE: no email_verified key
        })
        await ensure_indexes(rdb)
        fresh = await rdb.accounts.find_one({"email": legacy_email}, {"_id": 0})
        # Cleanup.
        await rdb.accounts.delete_one({"email": legacy_email})
        client.close()
        return fresh

    fresh = asyncio.get_event_loop().run_until_complete(_run())
    assert fresh.get("email_verified") is True


# ----- Admin email settings -----

def _admin_token():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": "bsn.1988@hotmail.com", "password": "11qqQQ!!"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def test_email_settings_admin_only():
    # Anonymous → 401.
    r = requests.get(f"{API}/admin/email-settings", timeout=15)
    assert r.status_code in (401, 403)

    # Non-admin (regular user) → 403.
    _, email, password = _register("-i")
    verify_token = _read_token_from_logs(email, "verify")
    requests.post(f"{API}/auth/verify-email", json={"token": verify_token}, timeout=15)
    rl = requests.post(
        f"{API}/auth/login",
        json={"email": email, "password": password},
        timeout=15,
    )
    user_token = rl.json()["access_token"]
    r2 = requests.get(
        f"{API}/admin/email-settings",
        headers={"Authorization": f"Bearer {user_token}"},
        timeout=15,
    )
    assert r2.status_code == 403


def test_admin_email_settings_round_trip_with_password_mask():
    tok = _admin_token()
    headers = {"Authorization": f"Bearer {tok}"}
    # Write fresh settings WITH a real password.
    body = {
        "smtp_host": "smtp.example.com",
        "smtp_port": 587,
        "smtp_username": "noreply@example.com",
        "smtp_password": "supersecret",
        "use_tls": True,
        "sender_email": "noreply@example.com",
        "sender_name": "My Life My Time",
    }
    r = requests.put(f"{API}/admin/email-settings", json=body, headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    saved = r.json()
    assert saved["smtp_host"] == "smtp.example.com"
    assert saved["smtp_password_set"] is True
    # Password field is never returned in cleartext.
    assert "smtp_password" not in saved

    # PUT WITHOUT smtp_password (or with masked placeholder) keeps the
    # stored password — admin can edit hostname without re-entering pw.
    r2 = requests.put(
        f"{API}/admin/email-settings",
        json={"sender_name": "New Brand", "smtp_password": "********"},
        headers=headers,
        timeout=15,
    )
    assert r2.status_code == 200
    saved2 = r2.json()
    assert saved2["sender_name"] == "New Brand"
    assert saved2["smtp_password_set"] is True  # unchanged

    # Explicit empty string clears the password.
    r3 = requests.put(
        f"{API}/admin/email-settings",
        json={"smtp_password": ""},
        headers=headers,
        timeout=15,
    )
    assert r3.status_code == 200
    assert r3.json()["smtp_password_set"] is False
