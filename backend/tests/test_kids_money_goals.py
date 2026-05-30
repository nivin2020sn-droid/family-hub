"""Backend tests for the Kids' Money 'Saving Goals' feature.

Covers:
  * Empty list for fresh child
  * Create goal decorated with saved + progress_pct (capped to target)
  * Validation: target_amount<=0, blank name -> 400 (POST + PUT)
  * Child cannot create goal targeted at another member (forced to self)
  * is_complete toggle freezes saved at target and stamps/clears completed_at
  * include_completed=false filter
  * Delete removes goal
  * Non-admin other member -> 403 on PUT/DELETE
  * Family admin can PUT/DELETE any child's goal
  * Multi-tenant isolation across families
  * Balance > target caps saved at target_amount (no overshoot)
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


# ----- helpers (mirror test_kids_money.py) -----

def _unique_email(tag="goals"):
    return f"qa-{tag}-{int(time.time()*1000)}-{uuid.uuid4().hex[:6]}@example.com"


def _register():
    r = requests.post(
        f"{API}/auth/register",
        json={
            "family_name": "TEST_GOALS_Family",
            "email": _unique_email(),
            "password": "Pass1234!",
            "confirm_password": "Pass1234!",
        },
        timeout=20,
    )
    assert r.status_code == 200, f"register: {r.status_code} {r.text}"
    d = r.json()
    return {"account_token": d["access_token"], "family_id": d["family"]["id"]}


def _add_member(token, name, role, pin):
    r = requests.post(
        f"{API}/family/members",
        json={"name": name, "role": role, "pin": pin},
        headers={"Authorization": f"Bearer {token}"},
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
    return r.json()["member_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


def _deposit(tok, amount):
    r = requests.post(
        f"{API}/kids-money/transactions",
        json={"type": "income", "amount": amount, "description": "TEST_seed"},
        headers=_h(tok),
        timeout=15,
    )
    assert r.status_code == 200, r.text


# ----- fixtures -----

@pytest.fixture(scope="module")
def family_a():
    fam = _register()
    admin = _add_member(fam["account_token"], "TEST_Parent", "parent", "1234")
    admin_tok = _select(fam["account_token"], admin["id"], "1234")
    kid1 = _add_member(admin_tok, "TEST_KidA1", "child", "4321")
    kid2 = _add_member(admin_tok, "TEST_KidA2", "child", "5678")
    adult = _add_member(admin_tok, "TEST_AdultA", "adult", "9999")
    return {
        "family_id": fam["family_id"],
        "account_token": fam["account_token"],
        "admin": {"id": admin["id"], "token": admin_tok},
        "kid1": {"id": kid1["id"], "token": _select(fam["account_token"], kid1["id"], "4321")},
        "kid2": {"id": kid2["id"], "token": _select(fam["account_token"], kid2["id"], "5678")},
        "adult": {"id": adult["id"], "token": _select(fam["account_token"], adult["id"], "9999")},
    }


@pytest.fixture(scope="module")
def family_b():
    fam = _register()
    admin = _add_member(fam["account_token"], "TEST_ParentB", "parent", "1234")
    admin_tok = _select(fam["account_token"], admin["id"], "1234")
    kid = _add_member(admin_tok, "TEST_KidB", "child", "4321")
    return {
        "family_id": fam["family_id"],
        "admin": {"id": admin["id"], "token": admin_tok},
        "kid": {"id": kid["id"], "token": _select(fam["account_token"], kid["id"], "4321")},
    }


# ----- tests -----

# Empty state for a fresh child
def test_fresh_child_goals_empty(family_a):
    r = requests.get(f"{API}/kids-money/goals", headers=_h(family_a["kid1"]["token"]))
    assert r.status_code == 200, r.text
    assert r.json() == []


# Child creates Bike(80) after 30 balance -> saved=30, pct=37.5
def test_child_create_goal_progress(family_a):
    tok = family_a["kid1"]["token"]
    _deposit(tok, 30)
    r = requests.post(
        f"{API}/kids-money/goals",
        json={"name": "Bike", "target_amount": 80},
        headers=_h(tok),
    )
    assert r.status_code == 200, r.text
    g = r.json()
    assert g["name"] == "Bike"
    assert g["target_amount"] == 80
    assert g["member_id"] == family_a["kid1"]["id"]
    assert g["saved"] == 30
    assert g["progress_pct"] == 37.5
    assert g["is_complete"] is False
    assert g["completed_at"] is None
    # Stash for downstream tests
    family_a["bike_id"] = g["id"]


# Validation: bad target
@pytest.mark.parametrize("bad", [0, -5])
def test_create_goal_rejects_non_positive_target(family_a, bad):
    r = requests.post(
        f"{API}/kids-money/goals",
        json={"name": "X", "target_amount": bad},
        headers=_h(family_a["kid1"]["token"]),
    )
    assert r.status_code == 400, r.text


# Validation: blank name
@pytest.mark.parametrize("bad_name", ["", "   "])
def test_create_goal_rejects_blank_name(family_a, bad_name):
    r = requests.post(
        f"{API}/kids-money/goals",
        json={"name": bad_name, "target_amount": 10},
        headers=_h(family_a["kid1"]["token"]),
    )
    assert r.status_code == 400, r.text


# Child cross-targeting another member is silently forced to self
def test_child_cross_target_is_forced_to_self(family_a):
    r = requests.post(
        f"{API}/kids-money/goals",
        json={"name": "Sneaky", "target_amount": 10, "member_id": family_a["kid2"]["id"]},
        headers=_h(family_a["kid1"]["token"]),
    )
    assert r.status_code == 200, r.text
    assert r.json()["member_id"] == family_a["kid1"]["id"]

    # kid2's list must still be empty
    r2 = requests.get(f"{API}/kids-money/goals", headers=_h(family_a["kid2"]["token"]))
    assert r2.status_code == 200
    assert r2.json() == []


# PUT is_complete=true freezes saved at target even if balance < target
def test_complete_freezes_saved_at_target(family_a):
    gid = family_a["bike_id"]  # target 80, balance 30
    r = requests.put(
        f"{API}/kids-money/goals/{gid}",
        json={"is_complete": True},
        headers=_h(family_a["kid1"]["token"]),
    )
    assert r.status_code == 200, r.text
    g = r.json()
    assert g["is_complete"] is True
    assert g["saved"] == 80
    assert g["progress_pct"] == 100
    assert g["completed_at"] is not None


# PUT is_complete=false clears completed_at
def test_reopen_clears_completed_at(family_a):
    gid = family_a["bike_id"]
    r = requests.put(
        f"{API}/kids-money/goals/{gid}",
        json={"is_complete": False},
        headers=_h(family_a["kid1"]["token"]),
    )
    assert r.status_code == 200, r.text
    g = r.json()
    assert g["is_complete"] is False
    assert g["completed_at"] is None
    assert g["saved"] == 30  # back to balance-capped value


# PUT validation: bad target / blank name
def test_put_validation(family_a):
    gid = family_a["bike_id"]
    r1 = requests.put(
        f"{API}/kids-money/goals/{gid}",
        json={"target_amount": 0},
        headers=_h(family_a["kid1"]["token"]),
    )
    assert r1.status_code == 400, r1.text
    r2 = requests.put(
        f"{API}/kids-money/goals/{gid}",
        json={"name": "   "},
        headers=_h(family_a["kid1"]["token"]),
    )
    assert r2.status_code == 400, r2.text


# include_completed=false filter
def test_include_completed_filter(family_a):
    tok = family_a["kid1"]["token"]
    # Create a small one-shot completed goal
    r = requests.post(
        f"{API}/kids-money/goals",
        json={"name": "Toy", "target_amount": 5},
        headers=_h(tok),
    )
    assert r.status_code == 200
    toy_id = r.json()["id"]
    requests.put(
        f"{API}/kids-money/goals/{toy_id}",
        json={"is_complete": True},
        headers=_h(tok),
    )
    # default = include
    r_all = requests.get(f"{API}/kids-money/goals", headers=_h(tok))
    ids_all = {g["id"] for g in r_all.json()}
    assert toy_id in ids_all
    # filtered
    r_active = requests.get(
        f"{API}/kids-money/goals?include_completed=false", headers=_h(tok)
    )
    ids_active = {g["id"] for g in r_active.json()}
    assert toy_id not in ids_active


# Non-admin other member -> 403 on PUT/DELETE
def test_other_child_cannot_put_or_delete(family_a):
    gid = family_a["bike_id"]
    other = _h(family_a["kid2"]["token"])
    r_put = requests.put(f"{API}/kids-money/goals/{gid}", json={"name": "Hacked"}, headers=other)
    assert r_put.status_code == 403, r_put.text
    r_del = requests.delete(f"{API}/kids-money/goals/{gid}", headers=other)
    assert r_del.status_code == 403, r_del.text


def test_adult_non_admin_cannot_touch_child_goal(family_a):
    gid = family_a["bike_id"]
    other = _h(family_a["adult"]["token"])
    r_put = requests.put(f"{API}/kids-money/goals/{gid}", json={"name": "Hacked"}, headers=other)
    assert r_put.status_code == 403, r_put.text
    r_del = requests.delete(f"{API}/kids-money/goals/{gid}", headers=other)
    assert r_del.status_code == 403, r_del.text


# Family admin can PUT/DELETE any child's goal
def test_admin_can_edit_and_delete_child_goal(family_a):
    # Create a goal as admin targeted at kid2
    r_create = requests.post(
        f"{API}/kids-money/goals",
        json={"name": "AdminMade", "target_amount": 50, "member_id": family_a["kid2"]["id"]},
        headers=_h(family_a["admin"]["token"]),
    )
    assert r_create.status_code == 200, r_create.text
    g = r_create.json()
    assert g["member_id"] == family_a["kid2"]["id"]

    # Admin edits
    r_put = requests.put(
        f"{API}/kids-money/goals/{g['id']}",
        json={"name": "AdminEdited", "target_amount": 60},
        headers=_h(family_a["admin"]["token"]),
    )
    assert r_put.status_code == 200, r_put.text
    assert r_put.json()["name"] == "AdminEdited"
    assert r_put.json()["target_amount"] == 60

    # Admin deletes
    r_del = requests.delete(
        f"{API}/kids-money/goals/{g['id']}", headers=_h(family_a["admin"]["token"])
    )
    assert r_del.status_code == 200, r_del.text

    # Confirm gone for kid2
    r_list = requests.get(
        f"{API}/kids-money/goals?member_id={family_a['kid2']['id']}",
        headers=_h(family_a["admin"]["token"]),
    )
    assert r_list.status_code == 200
    assert all(x["id"] != g["id"] for x in r_list.json())


# Multi-tenant: family B admin forging family A kid id -> 404 Member not found
def test_multi_tenant_isolation(family_a, family_b):
    r = requests.get(
        f"{API}/kids-money/goals?member_id={family_a['kid1']['id']}",
        headers=_h(family_b["admin"]["token"]),
    )
    # Admin in family B trying to read a member_id that belongs to family A
    assert r.status_code == 404, r.text


# Balance > target caps saved at target
def test_balance_over_target_caps_saved(family_a):
    tok = family_a["kid1"]["token"]
    # Existing bike (target 80). Deposit enough to exceed 80.
    # Existing balance was 30 (and we created a Sneaky/Toy unrelated; balance still 30)
    _deposit(tok, 100)  # balance now 130
    r = requests.get(f"{API}/kids-money/goals", headers=_h(tok))
    assert r.status_code == 200, r.text
    bike = next(g for g in r.json() if g["id"] == family_a["bike_id"])
    assert bike["saved"] == 80
    assert bike["progress_pct"] == 100


# Delete a goal removes it
def test_delete_goal(family_a):
    gid = family_a["bike_id"]
    r = requests.delete(f"{API}/kids-money/goals/{gid}", headers=_h(family_a["kid1"]["token"]))
    assert r.status_code == 200, r.text
    r2 = requests.get(f"{API}/kids-money/goals", headers=_h(family_a["kid1"]["token"]))
    assert all(g["id"] != gid for g in r2.json())
