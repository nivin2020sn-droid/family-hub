"""End-to-end backend tests for the Kids' Money ("My Money") feature.

Covers:
  * GET /api/kids-money/summary as a child returns own ledger only
  * Child passing ?member_id=<other> is silently forced back to self
  * Family admin can read any kid via ?member_id=<kid_id>
  * POST income / payment as child updates balance correctly
  * Negative/zero amount -> 400; unknown type -> 400
  * Family admin can POST with explicit member_id targeting a child
  * PUT as owner works; PUT as other child -> 403
  * DELETE works for owner + admin; 403 for any other non-admin
  * GET /api/kids-money/kids — admin only; child gets 403
  * Multi-tenant isolation: family A token cannot touch family B ledger
  * Adult (non-admin) POST without member_id succeeds (scoped to self_id)
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def _unique_email(tag="mm"):
    return f"qa-{tag}-{int(time.time()*1000)}-{uuid.uuid4().hex[:6]}@example.com"


def _register():
    email = _unique_email()
    r = requests.post(
        f"{API}/auth/register",
        json={
            "family_name": "TEST_MM_Family",
            "email": email,
            "password": "Pass1234!",
            "confirm_password": "Pass1234!",
        },
        timeout=20,
    )
    assert r.status_code == 200, f"register: {r.status_code} {r.text}"
    d = r.json()
    return {"email": email, "account_token": d["access_token"], "family_id": d["family"]["id"]}


def _add_first_admin(account_token, pin="1234", name="TEST_Parent"):
    r = requests.post(
        f"{API}/family/members",
        json={"name": name, "role": "parent", "pin": pin},
        headers={"Authorization": f"Bearer {account_token}"},
        timeout=15,
    )
    assert r.status_code == 200, f"add admin: {r.status_code} {r.text}"
    return r.json()


def _add_member(member_admin_token, name, role, pin):
    r = requests.post(
        f"{API}/family/members",
        json={"name": name, "role": role, "pin": pin},
        headers={"Authorization": f"Bearer {member_admin_token}"},
        timeout=15,
    )
    assert r.status_code == 200, f"add member {name}: {r.status_code} {r.text}"
    return r.json()


def _select(account_token, member_id, pin):
    r = requests.post(
        f"{API}/auth/member/select",
        json={"member_id": member_id, "pin": pin},
        headers={"Authorization": f"Bearer {account_token}"},
        timeout=15,
    )
    assert r.status_code == 200, f"select {member_id}: {r.status_code} {r.text}"
    return r.json()


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------------- Fixtures ----------------

@pytest.fixture(scope="module")
def family_a():
    """Family A: parent admin + 2 children + 1 adult (non-admin)."""
    fam = _register()
    admin_member = _add_first_admin(fam["account_token"], pin="1234")
    admin_sel = _select(fam["account_token"], admin_member["id"], "1234")
    admin_token = admin_sel["member_token"]

    kid1 = _add_member(admin_token, "TEST_Kid1", "child", "4321")
    kid2 = _add_member(admin_token, "TEST_Kid2", "child", "5678")
    adult = _add_member(admin_token, "TEST_Adult", "adult", "9999")

    kid1_sel = _select(fam["account_token"], kid1["id"], "4321")
    kid2_sel = _select(fam["account_token"], kid2["id"], "5678")
    adult_sel = _select(fam["account_token"], adult["id"], "9999")

    return {
        "family_id": fam["family_id"],
        "account_token": fam["account_token"],
        "admin": {"id": admin_member["id"], "token": admin_token},
        "kid1": {"id": kid1["id"], "token": kid1_sel["member_token"]},
        "kid2": {"id": kid2["id"], "token": kid2_sel["member_token"]},
        "adult": {"id": adult["id"], "token": adult_sel["member_token"]},
    }


@pytest.fixture(scope="module")
def family_b():
    """Second family for cross-tenant tests."""
    fam = _register()
    admin_member = _add_first_admin(fam["account_token"], pin="1234", name="TEST_ParentB")
    admin_sel = _select(fam["account_token"], admin_member["id"], "1234")
    admin_token = admin_sel["member_token"]
    kid = _add_member(admin_token, "TEST_KidB", "child", "4321")
    kid_sel = _select(fam["account_token"], kid["id"], "4321")
    return {
        "family_id": fam["family_id"],
        "admin": {"id": admin_member["id"], "token": admin_token},
        "kid": {"id": kid["id"], "token": kid_sel["member_token"]},
    }


# ---------------- Tests ----------------

def test_child_summary_returns_own_ledger(family_a):
    r = requests.get(f"{API}/kids-money/summary", headers=_h(family_a["kid1"]["token"]))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["member"]["id"] == family_a["kid1"]["id"]
    assert body["member"]["role"] == "child"
    assert body["balance"] == 0
    assert body["income"] == 0
    assert body["payments"] == 0
    assert body["entries_count"] == 0


def test_child_passing_other_member_id_is_silently_forced_to_self(family_a):
    # kid1 tries to read kid2's ledger -> server forces target back to kid1
    r = requests.get(
        f"{API}/kids-money/summary",
        params={"member_id": family_a["kid2"]["id"]},
        headers=_h(family_a["kid1"]["token"]),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["member"]["id"] == family_a["kid1"]["id"], "Child must not see another member"


def test_admin_can_read_any_kid_summary(family_a):
    r = requests.get(
        f"{API}/kids-money/summary",
        params={"member_id": family_a["kid1"]["id"]},
        headers=_h(family_a["admin"]["token"]),
    )
    assert r.status_code == 200, r.text
    assert r.json()["member"]["id"] == family_a["kid1"]["id"]


def test_child_post_income_then_payment_balance_math(family_a):
    tok = _h(family_a["kid1"]["token"])
    r1 = requests.post(
        f"{API}/kids-money/transactions",
        json={"type": "income", "amount": 20, "description": "Allowance"},
        headers=tok,
    )
    assert r1.status_code == 200, r1.text
    e1 = r1.json()
    assert e1["type"] == "income"
    assert e1["amount"] == 20
    assert e1["member_id"] == family_a["kid1"]["id"]
    assert e1["description"] == "Allowance"

    # GET summary -> balance = 20
    r2 = requests.get(f"{API}/kids-money/summary", headers=tok)
    assert r2.status_code == 200
    assert r2.json()["balance"] == 20
    assert r2.json()["income"] == 20

    # POST payment 8 -> balance 12
    r3 = requests.post(
        f"{API}/kids-money/transactions",
        json={"type": "payment", "amount": 8, "description": "Snack"},
        headers=tok,
    )
    assert r3.status_code == 200, r3.text

    r4 = requests.get(f"{API}/kids-money/summary", headers=tok)
    body = r4.json()
    assert body["income"] == 20
    assert body["payments"] == 8
    assert body["balance"] == 12
    assert body["entries_count"] == 2


def test_post_negative_amount_returns_400(family_a):
    r = requests.post(
        f"{API}/kids-money/transactions",
        json={"type": "income", "amount": -5},
        headers=_h(family_a["kid1"]["token"]),
    )
    assert r.status_code == 400
    assert "positive" in r.text.lower()


def test_post_zero_amount_returns_400(family_a):
    r = requests.post(
        f"{API}/kids-money/transactions",
        json={"type": "income", "amount": 0},
        headers=_h(family_a["kid1"]["token"]),
    )
    assert r.status_code == 400


def test_post_unknown_type_returns_400(family_a):
    r = requests.post(
        f"{API}/kids-money/transactions",
        json={"type": "bogus", "amount": 5},
        headers=_h(family_a["kid1"]["token"]),
    )
    assert r.status_code == 400


def test_admin_post_with_explicit_member_id_targets_child(family_a):
    r = requests.post(
        f"{API}/kids-money/transactions",
        json={"type": "income", "amount": 50, "description": "Eid", "member_id": family_a["kid2"]["id"]},
        headers=_h(family_a["admin"]["token"]),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["member_id"] == family_a["kid2"]["id"]
    assert body["amount"] == 50

    # Verify via kid2 summary
    r2 = requests.get(f"{API}/kids-money/summary", headers=_h(family_a["kid2"]["token"]))
    assert r2.json()["balance"] == 50


def test_put_as_owner_updates(family_a):
    # Create entry as kid1
    r = requests.post(
        f"{API}/kids-money/transactions",
        json={"type": "income", "amount": 10, "description": "Gift"},
        headers=_h(family_a["kid1"]["token"]),
    )
    eid = r.json()["id"]

    r2 = requests.put(
        f"{API}/kids-money/transactions/{eid}",
        json={"amount": 15, "description": "Bigger gift"},
        headers=_h(family_a["kid1"]["token"]),
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["amount"] == 15
    assert r2.json()["description"] == "Bigger gift"


def test_put_as_other_child_returns_403(family_a):
    # Create entry as kid1
    r = requests.post(
        f"{API}/kids-money/transactions",
        json={"type": "income", "amount": 7},
        headers=_h(family_a["kid1"]["token"]),
    )
    eid = r.json()["id"]

    # kid2 tries to mutate kid1's entry
    r2 = requests.put(
        f"{API}/kids-money/transactions/{eid}",
        json={"amount": 999},
        headers=_h(family_a["kid2"]["token"]),
    )
    assert r2.status_code == 403, r2.text


def test_delete_as_owner_works(family_a):
    r = requests.post(
        f"{API}/kids-money/transactions",
        json={"type": "payment", "amount": 3},
        headers=_h(family_a["kid1"]["token"]),
    )
    eid = r.json()["id"]
    r2 = requests.delete(
        f"{API}/kids-money/transactions/{eid}",
        headers=_h(family_a["kid1"]["token"]),
    )
    assert r2.status_code == 200


def test_delete_as_admin_works(family_a):
    # Create entry as kid2
    r = requests.post(
        f"{API}/kids-money/transactions",
        json={"type": "income", "amount": 2},
        headers=_h(family_a["kid2"]["token"]),
    )
    eid = r.json()["id"]
    r2 = requests.delete(
        f"{API}/kids-money/transactions/{eid}",
        headers=_h(family_a["admin"]["token"]),
    )
    assert r2.status_code == 200


def test_delete_as_other_child_returns_403(family_a):
    r = requests.post(
        f"{API}/kids-money/transactions",
        json={"type": "income", "amount": 4},
        headers=_h(family_a["kid1"]["token"]),
    )
    eid = r.json()["id"]
    r2 = requests.delete(
        f"{API}/kids-money/transactions/{eid}",
        headers=_h(family_a["kid2"]["token"]),
    )
    assert r2.status_code == 403


def test_kids_list_admin_only(family_a):
    r = requests.get(f"{API}/kids-money/kids", headers=_h(family_a["admin"]["token"]))
    assert r.status_code == 200, r.text
    body = r.json()
    assert "kids" in body
    ids = {k["id"] for k in body["kids"]}
    assert family_a["kid1"]["id"] in ids
    assert family_a["kid2"]["id"] in ids
    # admin's parent member must NOT be in /kids (only role=child)
    assert family_a["admin"]["id"] not in ids


def test_kids_list_child_token_returns_403(family_a):
    r = requests.get(f"{API}/kids-money/kids", headers=_h(family_a["kid1"]["token"]))
    assert r.status_code == 403


def test_kids_list_adult_non_admin_returns_403(family_a):
    r = requests.get(f"{API}/kids-money/kids", headers=_h(family_a["adult"]["token"]))
    assert r.status_code == 403


def test_multi_tenant_isolation_admin_cannot_target_other_family_kid(family_a, family_b):
    # Family A admin tries to read family B kid
    r = requests.get(
        f"{API}/kids-money/summary",
        params={"member_id": family_b["kid"]["id"]},
        headers=_h(family_a["admin"]["token"]),
    )
    assert r.status_code == 404, r.text


def test_multi_tenant_isolation_child_cross_family(family_a, family_b):
    # Kid in family A passes member_id of kid in family B; server silently
    # forces back to self (kid_a) — should NOT leak family B data
    r = requests.get(
        f"{API}/kids-money/summary",
        params={"member_id": family_b["kid"]["id"]},
        headers=_h(family_a["kid1"]["token"]),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["member"]["id"] == family_a["kid1"]["id"]


def test_adult_non_admin_post_scoped_to_self(family_a):
    # Adult (non-admin) hits POST without member_id -> server scopes to self
    r = requests.post(
        f"{API}/kids-money/transactions",
        json={"type": "income", "amount": 6, "description": "Self ledger"},
        headers=_h(family_a["adult"]["token"]),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["member_id"] == family_a["adult"]["id"]

    # Summary returns self
    r2 = requests.get(f"{API}/kids-money/summary", headers=_h(family_a["adult"]["token"]))
    assert r2.status_code == 200
    assert r2.json()["member"]["id"] == family_a["adult"]["id"]
    assert r2.json()["balance"] == 6
