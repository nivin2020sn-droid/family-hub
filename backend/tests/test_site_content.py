"""Regression for /api/site-content (admin-managed legal & brand text).

Asserts:
- GET is public (no auth) and returns ALL expected fields.
- PUT requires an admin token; non-admin / no-auth get 401/403.
- PUT is partial — only sent fields are modified, the rest stay intact.
- Empty string from the admin falls back to the server-side defaults
  (so the admin has an easy way to "reset" a field).
- Defaults include all required keys with non-empty content so the
  public legal pages always render with text.
"""

import os
import time

import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

REQUIRED_FIELDS = (
    "app_name",
    "app_version",
    "company_name",
    "contact_email",
    "address",
    "phone_number",
    "privacy_policy",
    "terms_of_service",
    "legal_notice",
    "disclaimer",
)


def _login_admin():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": "bsn.1988@hotmail.com", "password": "11qqQQ!!"},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def test_get_site_content_is_public():
    r = requests.get(f"{API}/site-content", timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    for key in REQUIRED_FIELDS:
        assert key in data, f"missing key: {key}"
    # Long-text fields must always have content (server-side defaults).
    assert len(data["privacy_policy"]) > 100
    assert len(data["terms_of_service"]) > 100
    assert len(data["legal_notice"]) > 100
    assert len(data["disclaimer"]) > 100
    # Brand defaults match the expected post-rebrand identity.
    assert data["app_name"] == "My Life My Time"
    assert data["contact_email"] == "info@mylife-mytime.com"


def test_put_site_content_requires_admin():
    # No token → 401.
    r = requests.put(
        f"{API}/site-content",
        json={"app_name": "hacker-attempt"},
        timeout=10,
    )
    assert r.status_code == 401, r.text

    # Register a regular family account and try with its token → 403.
    from tests.conftest import verify_account_email
    ts = int(time.time() * 1000)
    email = f"mock-{ts}@example.com"
    requests.post(
        f"{API}/auth/register",
        json={
            "family_name": f"Mock {ts}",
            "email": email,
            "password": "Pass1234!",
            "confirm_password": "Pass1234!",
            "accepted_beta_terms": True,
            "accepted_privacy_policy": True,
            "accepted_disclaimer": True,
        },
        timeout=10,
    )
    verify_account_email(email)
    reg = requests.post(
        f"{API}/auth/login",
        json={"email": email, "password": "Pass1234!"},
        timeout=10,
    ).json()
    r = requests.put(
        f"{API}/site-content",
        headers={"Authorization": f"Bearer {reg['access_token']}"},
        json={"app_name": "hacker-attempt"},
        timeout=10,
    )
    assert r.status_code == 403, r.text


def test_put_is_partial_and_round_trips():
    admin = _login_admin()
    headers = {"Authorization": f"Bearer {admin}"}
    # Snapshot current state so we can restore at the end.
    before = requests.get(f"{API}/site-content", timeout=10).json()

    marker = f"PYTEST-MARKER-{int(time.time())}"
    r = requests.put(
        f"{API}/site-content",
        headers=headers,
        json={"app_version": marker, "phone_number": "+49 123 456789"},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    after_put = r.json()
    assert after_put["app_version"] == marker
    assert after_put["phone_number"] == "+49 123 456789"
    # Untouched fields stay equal.
    assert after_put["app_name"] == before["app_name"]
    assert after_put["privacy_policy"] == before["privacy_policy"]
    assert after_put["updated_at"]

    # Public GET sees the same.
    pub = requests.get(f"{API}/site-content", timeout=10).json()
    assert pub["app_version"] == marker
    assert pub["phone_number"] == "+49 123 456789"

    # Empty string falls back to the default.
    r2 = requests.put(
        f"{API}/site-content",
        headers=headers,
        json={"app_version": "", "phone_number": ""},
        timeout=10,
    )
    assert r2.status_code == 200, r2.text
    after_reset = r2.json()
    # app_version default is non-empty; phone_number default is empty.
    assert after_reset["app_version"] != marker
    assert after_reset["app_version"]  # always falls back to default value


def test_put_empty_body_is_rejected():
    admin = _login_admin()
    r = requests.put(
        f"{API}/site-content",
        headers={"Authorization": f"Bearer {admin}"},
        json={},
        timeout=10,
    )
    assert r.status_code == 400
