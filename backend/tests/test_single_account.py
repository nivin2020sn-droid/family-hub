"""Regression for the Single Account flow (no-family personal account).

Asserts:
- Register with account_type=single auto-creates a member + returns both
  access_token AND member_token in one response (no "Who are you?" step).
- The auto-created member is the only one, has is_family_admin=true,
  and is named after the supplied display name (or email local-part if blank).
- Login on the same account also auto-issues a member_token.
- /api/budget/summary scoped to the single member shows only that member's
  wallet_owners (length 1) — no Bahaa/Theresa hardcoding.
- POST /api/auth/upgrade-to-family flips the family to family-type and renames it.
- A second upgrade attempt returns 400.
"""

import os
import time
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


def _register_single(name="Alex", email_suffix=""):
    """Register, verify the email, then login so the returned dict has both
    tokens. The original test contract was: after register the caller has
    access_token + member_token. We preserve that shape post-verify-gate."""
    from tests.conftest import verify_account_email
    ts = f"{int(time.time()*1000)}{email_suffix}"
    payload = {
        "family_name": name,
        "email": f"single-{ts}@example.com",
        "password": "Pass1234!",
        "confirm_password": "Pass1234!",
        "account_type": "single",
        "accepted_beta_terms": True,
        "accepted_privacy_policy": True,
        "accepted_disclaimer": True,
    }
    r = requests.post(f"{API}/auth/register", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    verify_account_email(payload["email"])
    r2 = requests.post(
        f"{API}/auth/login",
        json={"email": payload["email"], "password": payload["password"]},
        timeout=15,
    )
    assert r2.status_code == 200, r2.text
    return r2.json(), payload["email"], payload["password"]


def test_single_register_returns_both_tokens_and_member():
    data, _, _ = _register_single("Layla", "-a")
    assert data["family"]["account_type"] == "single"
    assert data.get("access_token")
    assert data.get("member_token"), "single register must auto-issue member_token"
    member = data["member"]
    assert member["name"] == "Layla"
    assert member["is_family_admin"] is True
    assert member["role"] == "adult"


def test_single_register_defaults_name_to_email_local_part():
    """If family_name is empty for a single account, fall back to email prefix."""
    from tests.conftest import verify_account_email
    ts = int(time.time() * 1000)
    email = f"jane-{ts}@example.com"
    r = requests.post(
        f"{API}/auth/register",
        json={
            "family_name": "",
            "email": email,
            "password": "Pass1234!",
            "confirm_password": "Pass1234!",
            "account_type": "single",
            "accepted_beta_terms": True,
            "accepted_privacy_policy": True,
            "accepted_disclaimer": True,
        },
        timeout=15,
    )
    assert r.status_code == 200, r.text
    verify_account_email(email)
    r2 = requests.post(
        f"{API}/auth/login",
        json={"email": email, "password": "Pass1234!"},
        timeout=15,
    )
    data = r2.json()
    member = data.get("member")
    assert member is not None
    assert member["name"].startswith(f"jane-{ts}")


def test_single_login_auto_issues_member_token():
    data, email, password = _register_single("Sam", "-b")
    r = requests.post(
        f"{API}/auth/login",
        json={"email": email, "password": password},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    login = r.json()
    assert login["family"]["account_type"] == "single"
    assert login.get("access_token")
    assert login.get("member_token"), "single login must auto-issue member_token"
    assert login["member"]["name"] == "Sam"


def test_single_budget_summary_has_one_wallet_only():
    data, _, _ = _register_single("Mira", "-c")
    mt = data["member_token"]
    summary = requests.get(
        f"{API}/budget/summary",
        headers={"Authorization": f"Bearer {mt}"},
        timeout=10,
    ).json()
    owners = summary["wallet_owners"]
    assert len(owners) == 1
    assert owners[0]["name"] == "Mira"
    # And the only owner-id key in by_owner is that member + shared (zero).
    income_keys = set(summary["by_owner"]["income"].keys())
    assert owners[0]["id"] in income_keys
    assert "shared" in income_keys


def test_upgrade_to_family_flips_account_type():
    data, _, _ = _register_single("Owen", "-d")
    acc = data["access_token"]
    r = requests.post(
        f"{API}/auth/upgrade-to-family",
        headers={"Authorization": f"Bearer {acc}"},
        json={"family_name": "Owen Family"},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    up = r.json()
    assert up["ok"] is True
    assert up["family"]["account_type"] == "family"
    assert up["family"]["name"] == "Owen Family"

    # Second upgrade attempt should fail.
    r2 = requests.post(
        f"{API}/auth/upgrade-to-family",
        headers={"Authorization": f"Bearer {acc}"},
        json={"family_name": "x"},
        timeout=10,
    )
    assert r2.status_code == 400


def test_upgrade_requires_non_empty_family_name():
    data, _, _ = _register_single("Lia", "-e")
    acc = data["access_token"]
    r = requests.post(
        f"{API}/auth/upgrade-to-family",
        headers={"Authorization": f"Bearer {acc}"},
        json={"family_name": "   "},
        timeout=10,
    )
    assert r.status_code == 400
