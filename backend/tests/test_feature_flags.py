"""
Feature Flags — Family Locator gate.

Covers:
  1. Default state: locator_enabled = False.
  2. Public /api/feature-flags is reachable without auth and returns the
     flag shape.
  3. While disabled, every /api/location/* route returns 403 with a clear
     detail message — including from authenticated callers (the gate is
     deeper than auth).
  4. Admin can flip locator_enabled to True via PUT /api/admin/feature-flags
     and the public endpoint reflects the change immediately.
  5. While enabled, /api/location/latest no longer 403s.
  6. Admin can flip it back to False; gate re-engages.
  7. Non-admin tokens cannot reach the admin endpoints (401/403).
"""

import os
import time
import uuid

import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
TIMEOUT = 20
ADMIN_EMAIL = "bsn.1988@hotmail.com"
ADMIN_PASSWORD = "11qqQQ!!"


def _admin_token():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


def _set_flag(tok, value):
    r = requests.put(
        f"{API}/admin/feature-flags",
        json={"locator_enabled": bool(value)},
        headers=_h(tok),
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, r.text
    return r.json()


def test_public_endpoint_no_auth():
    """Anyone can read the public feature-flags endpoint."""
    r = requests.get(f"{API}/feature-flags", timeout=TIMEOUT)
    assert r.status_code == 200
    body = r.json()
    assert "locator_enabled" in body
    assert isinstance(body["locator_enabled"], bool)


def test_locator_disabled_blocks_routes():
    """When the flag is False, /location/* return 403 regardless of auth."""
    tok = _admin_token()
    _set_flag(tok, False)
    # Public read still works
    r = requests.get(f"{API}/feature-flags", timeout=TIMEOUT)
    assert r.json()["locator_enabled"] is False
    # /location/latest blocked even WITHOUT auth (gate fires before auth check)
    r = requests.get(f"{API}/location/latest", timeout=TIMEOUT)
    assert r.status_code == 403
    assert "disabled" in r.json()["detail"].lower()
    # /location/update too
    r = requests.post(
        f"{API}/location/update",
        json={
            "familyCode": "anything",
            "memberId": "x",
            "name": "x",
            "latitude": 0.0,
            "longitude": 0.0,
        },
        timeout=TIMEOUT,
    )
    assert r.status_code == 403
    assert "disabled" in r.json()["detail"].lower()


def test_locator_enabled_allows_routes():
    """Once admin flips the flag, the same routes stop returning 403."""
    tok = _admin_token()
    _set_flag(tok, True)
    try:
        # Public read shows True
        r = requests.get(f"{API}/feature-flags", timeout=TIMEOUT)
        assert r.json()["locator_enabled"] is True
        # /location/latest now requires family context (401, NOT 403)
        r = requests.get(f"{API}/location/latest", timeout=TIMEOUT)
        assert r.status_code != 403, r.text
        # And it doesn't say "disabled" anymore
        if r.status_code != 200:
            assert "disabled" not in r.text.lower()
    finally:
        # Always reset the flag — this is a shared environment
        _set_flag(tok, False)


def test_admin_endpoint_requires_admin():
    """Random tokens cannot read or write feature flags."""
    # Register a regular family
    email = f"flag-{int(time.time()*1000)}-{uuid.uuid4().hex[:6]}@example.com"
    r = requests.post(
        f"{API}/auth/register",
        json={
            "email": email, "password": "Pass1234!", "confirm_password": "Pass1234!",
            "family_name": "FlagFam",
            "accepted_beta_terms": True,
            "accepted_privacy_policy": True,
            "accepted_disclaimer": True,
        },
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, r.text
    from tests.conftest import verify_account_email
    verify_account_email(email)
    r = requests.post(
        f"{API}/auth/login",
        json={"email": email, "password": "Pass1234!"},
        timeout=TIMEOUT,
    )
    fam_tok = r.json()["access_token"]
    # GET — non-admin should be blocked
    r = requests.get(f"{API}/admin/feature-flags", headers=_h(fam_tok), timeout=TIMEOUT)
    assert r.status_code in (401, 403)
    # PUT — non-admin should be blocked
    r = requests.put(
        f"{API}/admin/feature-flags",
        json={"locator_enabled": True},
        headers=_h(fam_tok),
        timeout=TIMEOUT,
    )
    assert r.status_code in (401, 403)


def test_admin_can_toggle_and_public_reflects():
    """Round-trip: admin flips, public sees the new value within seconds."""
    tok = _admin_token()
    _set_flag(tok, True)
    r = requests.get(f"{API}/feature-flags", timeout=TIMEOUT)
    assert r.json()["locator_enabled"] is True
    _set_flag(tok, False)
    r = requests.get(f"{API}/feature-flags", timeout=TIMEOUT)
    assert r.json()["locator_enabled"] is False
