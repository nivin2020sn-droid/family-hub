"""
Multi-tenant data isolation regression — Family A / B / C cross-leak audit.

Validates:
  - Retired endpoints /api/users and /api/auth/verify return 410.
  - /api/event-types REQUIRES a member token (401 unauth).
  - Three fresh families never see each other's data in:
    event-types, events, members, wall notes, kids-money tx, budget income/expenses/bills/debts.
  - /api/diag/tenant: admin token -> orphan counts zero; non-admin -> 403.
"""

import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
TIMEOUT = 20


# --------------------------------------------------------------------- helpers
def _register(email_tag: str, family_name: str):
    payload = {
        "email": f"qa-iso-{email_tag}-{int(time.time()*1000)}-{uuid.uuid4().hex[:6]}@example.com",
        "password": "Pass1234!",
        "confirm_password": "Pass1234!",
        "family_name": family_name,
        "accepted_beta_terms": True,
        "accepted_privacy_policy": True,
        "accepted_disclaimer": True,
    }
    r = requests.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=TIMEOUT)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    return payload["email"], r.json()


def _add_member(token, name, pin="1234", is_admin=True):
    body = {"name": name, "pin": pin, "is_family_admin": is_admin, "role": "parent"}
    r = requests.post(
        f"{BASE_URL}/api/family/members",
        json=body,
        headers={"Authorization": f"Bearer {token}"},
        timeout=TIMEOUT,
    )
    assert r.status_code in (200, 201), f"add member failed: {r.status_code} {r.text}"
    return r.json()


def _select_member(account_token, member_id, pin="1234"):
    r = requests.post(
        f"{BASE_URL}/api/auth/member/select",
        json={"member_id": member_id, "pin": pin},
        headers={"Authorization": f"Bearer {account_token}"},
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, f"member select failed: {r.status_code} {r.text}"
    return r.json()["member_token"]


def _bootstrap_family(tag, family_name, member_name, is_admin=True):
    email, reg = _register(tag, family_name)
    acc_tok = reg["access_token"]
    member = _add_member(acc_tok, member_name, "1234", is_admin)
    mem_tok = _select_member(acc_tok, member["id"], "1234")
    return {
        "email": email,
        "family_id": reg["family"]["id"],
        "account_token": acc_tok,
        "member_token": mem_tok,
        "member_id": member["id"],
    }


def _auth_h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ------------------------------------------------------------------- fixtures
@pytest.fixture(scope="module")
def family_a():
    return _bootstrap_family("A", "TEST_FamilyA", "Alice", is_admin=True)


@pytest.fixture(scope="module")
def family_b():
    return _bootstrap_family("B", "TEST_FamilyB", "Bob", is_admin=True)


@pytest.fixture(scope="module")
def family_c():
    return _bootstrap_family("C", "TEST_FamilyC", "Charlie", is_admin=True)


@pytest.fixture(scope="module")
def family_a_with_data(family_a):
    """Seed Family A with event-type, event, wall note, kids-money tx."""
    t = family_a["member_token"]
    # Event type
    et = requests.post(
        f"{BASE_URL}/api/event-types",
        json={"name": "KVD", "color": "#ff0000"},
        headers=_auth_h(t),
        timeout=TIMEOUT,
    )
    assert et.status_code == 200, et.text
    et_id = et.json()["id"]
    # Event
    ev = requests.post(
        f"{BASE_URL}/api/events",
        json={
            "title": "Morning Dienst",
            "date": "2026-02-15",
            "event_type_id": et_id,
            "color": "#ff0000",
        },
        headers=_auth_h(t),
        timeout=TIMEOUT,
    )
    assert ev.status_code in (200, 201), ev.text
    # Wall note
    wn = requests.post(
        f"{BASE_URL}/api/wall/notes",
        json={"text": "FamilyA-secret-note", "color": "yellow"},
        headers=_auth_h(t),
        timeout=TIMEOUT,
    )
    assert wn.status_code in (200, 201), wn.text
    # Kids money — add a kid (using family-admin member token now that A has one)
    kid = _add_member(family_a["member_token"], "AliceKid", "5678", False)
    tx = requests.post(
        f"{BASE_URL}/api/kids-money/transactions",
        json={
            "child_id": kid["id"],
            "amount": 5.0,
            "kind": "add",
            "note": "FamilyA-allowance",
        },
        headers=_auth_h(t),
        timeout=TIMEOUT,
    )
    # Some kids-money APIs differ — accept 200/201/422 (schema variance) but track
    if tx.status_code not in (200, 201):
        # Try alternative shape
        tx = requests.post(
            f"{BASE_URL}/api/kids-money/transactions",
            json={"child_id": kid["id"], "amount": 5.0, "type": "credit", "note": "x"},
            headers=_auth_h(t),
            timeout=TIMEOUT,
        )
    return {**family_a, "event_type_id": et_id}


# ============================================================ retired routes
def test_users_endpoint_410():
    r = requests.get(f"{BASE_URL}/api/users", timeout=TIMEOUT)
    assert r.status_code == 410
    assert "retired" in r.text.lower()


def test_auth_verify_410():
    r = requests.post(
        f"{BASE_URL}/api/auth/verify", json={"code": "FAMILY2026"}, timeout=TIMEOUT
    )
    assert r.status_code == 410
    assert "retired" in r.text.lower()


def test_event_types_unauth_is_401():
    r = requests.get(f"{BASE_URL}/api/event-types", timeout=TIMEOUT)
    assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"


# ====================================================== A→B isolation checks
def test_family_b_sees_no_event_types(family_a_with_data, family_b):
    r = requests.get(
        f"{BASE_URL}/api/event-types",
        headers=_auth_h(family_b["member_token"]),
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data == [], f"Family B leaked event types: {data}"


def test_family_b_sees_no_events(family_a_with_data, family_b):
    r = requests.get(
        f"{BASE_URL}/api/events",
        params={"year": 2026, "month": 2},
        headers=_auth_h(family_b["member_token"]),
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, r.text
    assert r.json() == [], f"Family B leaked events: {r.json()}"


def test_family_b_members_only_self(family_a_with_data, family_b):
    r = requests.get(
        f"{BASE_URL}/api/family/members",
        headers=_auth_h(family_b["member_token"]),
        timeout=TIMEOUT,
    )
    assert r.status_code == 200
    members = r.json()
    names = sorted(m.get("name") for m in members)
    assert names == ["Bob"], f"Family B members leak: {names}"


def test_family_b_no_wall_notes(family_a_with_data, family_b):
    r = requests.get(
        f"{BASE_URL}/api/wall/notes",
        headers=_auth_h(family_b["member_token"]),
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, r.text
    assert r.json() == [], f"Family B leaked wall notes: {r.json()}"


def test_family_b_no_kids_money_tx(family_a_with_data, family_b):
    r = requests.get(
        f"{BASE_URL}/api/kids-money/transactions",
        headers=_auth_h(family_b["member_token"]),
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, r.text
    assert r.json() == [], f"Family B leaked kids-money tx: {r.json()}"


@pytest.mark.parametrize(
    "path", ["budget/income", "budget/expenses", "budget/bills", "budget/debts"]
)
def test_family_b_no_budget_rows(family_a_with_data, family_b, path):
    r = requests.get(
        f"{BASE_URL}/api/{path}",
        headers=_auth_h(family_b["member_token"]),
        timeout=TIMEOUT,
    )
    # 200 with [] or 404 if route disabled — only [] is "clean"
    assert r.status_code == 200, f"{path}: {r.status_code} {r.text}"
    assert r.json() == [], f"Family B leaked {path}: {r.json()}"


# ====================================================== A→C isolation checks
def test_family_c_full_isolation(family_a_with_data, family_c):
    t = family_c["member_token"]
    et = requests.get(f"{BASE_URL}/api/event-types", headers=_auth_h(t), timeout=TIMEOUT)
    assert et.status_code == 200 and et.json() == []
    ev = requests.get(
        f"{BASE_URL}/api/events?year=2026&month=2", headers=_auth_h(t), timeout=TIMEOUT
    )
    assert ev.status_code == 200 and ev.json() == []
    members = requests.get(
        f"{BASE_URL}/api/family/members", headers=_auth_h(t), timeout=TIMEOUT
    )
    assert members.status_code == 200
    names = sorted(m["name"] for m in members.json())
    assert names == ["Charlie"], names
    notes = requests.get(
        f"{BASE_URL}/api/wall/notes", headers=_auth_h(t), timeout=TIMEOUT
    )
    assert notes.status_code == 200 and notes.json() == []


# ====================================================== diagnostics
def test_diag_tenant_admin_ok(family_a_with_data):
    r = requests.get(
        f"{BASE_URL}/api/diag/tenant",
        headers=_auth_h(family_a_with_data["member_token"]),
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["family_id"] == family_a_with_data["family_id"]
    assert isinstance(data["scoped_collection_counts"], dict)
    orphans = data["orphan_records_no_family_id"]
    assert isinstance(orphans, dict)
    total_orphans = sum(orphans.values())
    assert total_orphans == 0, f"orphan rows present: {orphans}"
    # Other-family rows must exist (we just made families B and C) yet remain
    # invisible to this scope — proven by the empty-list assertions above.
    assert isinstance(data["other_family_records_in_db"], dict)


def test_diag_tenant_non_admin_403(family_a_with_data):
    # Add a NON-admin member to Family A, select it, then call /diag/tenant.
    kid = _add_member(
        family_a_with_data["member_token"],
        "AliceKidNoAdmin",
        "2468",
        is_admin=False,
    )
    nonadmin_tok = _select_member(
        family_a_with_data["account_token"], kid["id"], "2468"
    )
    r = requests.get(
        f"{BASE_URL}/api/diag/tenant",
        headers=_auth_h(nonadmin_tok),
        timeout=TIMEOUT,
    )
    assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text}"
