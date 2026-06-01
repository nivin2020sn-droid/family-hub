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
    # Without auth, the per-family flag is always reported as False.
    assert body.get("family_locator_enabled") is False


def test_per_family_locator_flag_defaults_false_and_can_be_toggled():
    """Admin can flip the per-family `family_locator_enabled` flag, and the
    family-list endpoint reflects the change immediately."""
    tok = _admin_token()
    _set_flag(tok, True)  # global on
    try:
        # Find any existing family to flip
        r = requests.get(f"{API}/admin/families", headers=_h(tok), timeout=TIMEOUT)
        fams = r.json()["families"]
        assert fams, "no families in DB"
        target = fams[0]
        fid = target["id"]
        # Default should be False (migration runs on startup)
        assert target.get("family_locator_enabled") in (False, None)
        # Flip ON
        r = requests.post(
            f"{API}/admin/families/{fid}/locator",
            json={"enabled": True},
            headers=_h(tok), timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        assert r.json()["family_locator_enabled"] is True
        # Verify in list
        r = requests.get(f"{API}/admin/families", headers=_h(tok), timeout=TIMEOUT)
        fresh = next(x for x in r.json()["families"] if x["id"] == fid)
        assert fresh["family_locator_enabled"] is True
        # Flip OFF
        r = requests.post(
            f"{API}/admin/families/{fid}/locator",
            json={"enabled": False},
            headers=_h(tok), timeout=TIMEOUT,
        )
        assert r.status_code == 200
        assert r.json()["family_locator_enabled"] is False
    finally:
        _set_flag(tok, False)


def test_authenticated_family_sees_per_family_flag_in_public_endpoint():
    """An authenticated family member's call to /api/feature-flags returns
    BOTH the global flag and that family's `family_locator_enabled`."""
    admin_tok = _admin_token()
    _set_flag(admin_tok, True)  # global on
    try:
        # Bootstrap fresh family
        email = f"ff-{int(time.time()*1000)}-{uuid.uuid4().hex[:6]}@example.com"
        r = requests.post(
            f"{API}/auth/register",
            json={
                "email": email, "password": "Pass1234!", "confirm_password": "Pass1234!",
                "family_name": "FFTestFam",
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
        login = r.json()
        fam_tok = login["access_token"]
        fid = login["family"]["id"]
        # Without per-family flag set, public endpoint shows False for this family
        r = requests.get(f"{API}/feature-flags", headers=_h(fam_tok), timeout=TIMEOUT)
        body = r.json()
        assert body["locator_enabled"] is True
        assert body["family_locator_enabled"] is False
        # /location/latest should 403 with the per-family message
        r = requests.get(f"{API}/location/latest", headers=_h(fam_tok), timeout=TIMEOUT)
        assert r.status_code == 403
        assert "your family" in r.json()["detail"].lower()
        # Admin flips per-family flag ON
        requests.post(
            f"{API}/admin/families/{fid}/locator",
            json={"enabled": True},
            headers=_h(admin_tok), timeout=TIMEOUT,
        )
        # Public endpoint now shows True for this family
        r = requests.get(f"{API}/feature-flags", headers=_h(fam_tok), timeout=TIMEOUT)
        assert r.json()["family_locator_enabled"] is True
        # /location/latest no longer 403s
        r = requests.get(f"{API}/location/latest", headers=_h(fam_tok), timeout=TIMEOUT)
        assert r.status_code != 403, r.text
    finally:
        _set_flag(admin_tok, False)


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
