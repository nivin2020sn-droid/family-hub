"""End-to-end backend tests for the Family Members feature.

Covers:
  * Register → bootstrap admin promotion
  * 403 when adding a second member with an account token (after admin exists)
  * Member select returns is_family_admin flag
  * Full CRUD (add / edit / pin change / delete) using a member admin token
  * Last-admin guards (demote + delete)
  * Promote second admin → demote/delete first becomes possible
  * No pin_hash leakage
  * Multi-tenant isolation (family A token cannot see family B members)
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def _unique_email(tag: str = "fam") -> str:
    return f"qa-{tag}-{int(time.time()*1000)}-{uuid.uuid4().hex[:6]}@example.com"


def _register(session: requests.Session) -> dict:
    email = _unique_email()
    payload = {
        "family_name": "TEST_Family",
        "email": email,
        "password": "Pass1234!",
        "confirm_password": "Pass1234!",
    }
    r = session.post(f"{API}/auth/register", json=payload, timeout=15)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data and data["family"]["id"]
    return {"email": email, "account_token": data["access_token"], "family_id": data["family"]["id"]}


def _add_first_member(token: str, name="TEST_FirstAdmin", role="parent", pin="1234") -> dict:
    r = requests.post(
        f"{API}/family/members",
        json={"name": name, "role": role, "pin": pin},
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )
    assert r.status_code == 200, f"add first member failed: {r.status_code} {r.text}"
    return r.json()


def _select_member(account_token: str, member_id: str, pin: str) -> dict:
    r = requests.post(
        f"{API}/auth/member/select",
        json={"member_id": member_id, "pin": pin},
        headers={"Authorization": f"Bearer {account_token}"},
        timeout=15,
    )
    assert r.status_code == 200, f"select failed: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    yield s


# ---- Test 1: bootstrap promotion ----
def test_bootstrap_first_member_is_promoted_to_admin(session):
    fam = _register(session)
    body = _add_first_member(fam["account_token"], pin="1234")
    assert body["is_family_admin"] is True, "First member must be bootstrap-promoted"
    assert "pin_hash" not in body
    assert body["name"] == "TEST_FirstAdmin"


# ---- Test 2: 403 when adding via account token after admin exists ----
def test_second_add_via_account_token_returns_403(session):
    fam = _register(session)
    _add_first_member(fam["account_token"])
    r = requests.post(
        f"{API}/family/members",
        json={"name": "TEST_Two", "role": "adult", "pin": "5678"},
        headers={"Authorization": f"Bearer {fam['account_token']}"},
        timeout=15,
    )
    assert r.status_code == 403
    assert "Family admin permission required" in r.text


# ---- Test 3: member/select returns is_family_admin in payload ----
def test_member_select_includes_is_family_admin(session):
    fam = _register(session)
    m = _add_first_member(fam["account_token"], pin="1234")
    sel = _select_member(fam["account_token"], m["id"], "1234")
    assert "member_token" in sel
    assert sel["member"]["is_family_admin"] is True
    assert "pin_hash" not in sel["member"]


# ---- Test 4: full CRUD with member admin token ----
def test_full_crud_with_admin_member_token(session):
    fam = _register(session)
    admin = _add_first_member(fam["account_token"], pin="1234")
    sel = _select_member(fam["account_token"], admin["id"], "1234")
    mtoken = sel["member_token"]
    h = {"Authorization": f"Bearer {mtoken}"}

    # ADD non-admin
    r = requests.post(
        f"{API}/family/members",
        json={"name": "TEST_Kid", "role": "child", "pin": "9999"},
        headers=h, timeout=15,
    )
    assert r.status_code == 200
    kid = r.json()
    assert kid["is_family_admin"] is False
    assert kid["role"] == "child"

    # EDIT name + role
    r = requests.put(
        f"{API}/family/members/{kid['id']}",
        json={"name": "TEST_KidRenamed", "role": "adult"},
        headers=h, timeout=15,
    )
    assert r.status_code == 200
    upd = r.json()
    assert upd["name"] == "TEST_KidRenamed"
    assert upd["role"] == "adult"
    assert "pin_hash" not in upd

    # CHANGE PIN — old pin should no longer work, new pin should
    r = requests.put(
        f"{API}/family/members/{kid['id']}",
        json={"pin": "4321"},
        headers=h, timeout=15,
    )
    assert r.status_code == 200
    # old pin fails
    rbad = requests.post(
        f"{API}/auth/member/select",
        json={"member_id": kid["id"], "pin": "9999"},
        headers={"Authorization": f"Bearer {fam['account_token']}"}, timeout=15,
    )
    assert rbad.status_code == 401
    # new pin works
    rgood = requests.post(
        f"{API}/auth/member/select",
        json={"member_id": kid["id"], "pin": "4321"},
        headers={"Authorization": f"Bearer {fam['account_token']}"}, timeout=15,
    )
    assert rgood.status_code == 200

    # PROMOTE kid to admin
    r = requests.put(
        f"{API}/family/members/{kid['id']}",
        json={"is_family_admin": True}, headers=h, timeout=15,
    )
    assert r.status_code == 200
    assert r.json()["is_family_admin"] is True

    # DEMOTE kid
    r = requests.put(
        f"{API}/family/members/{kid['id']}",
        json={"is_family_admin": False}, headers=h, timeout=15,
    )
    assert r.status_code == 200
    assert r.json()["is_family_admin"] is False

    # DELETE kid (admin still safe because original admin remains)
    r = requests.delete(f"{API}/family/members/{kid['id']}", headers=h, timeout=15)
    assert r.status_code == 200

    # Verify gone
    r = requests.get(f"{API}/family/members", headers=h, timeout=15)
    ids = [m["id"] for m in r.json()]
    assert kid["id"] not in ids


# ---- Test 5: last-admin demote protection ----
def test_last_admin_cannot_be_demoted(session):
    fam = _register(session)
    admin = _add_first_member(fam["account_token"], pin="1234")
    sel = _select_member(fam["account_token"], admin["id"], "1234")
    h = {"Authorization": f"Bearer {sel['member_token']}"}
    r = requests.put(
        f"{API}/family/members/{admin['id']}",
        json={"is_family_admin": False}, headers=h, timeout=15,
    )
    assert r.status_code == 400
    assert "last family admin" in r.text.lower()


# ---- Test 6: last-admin delete protection ----
def test_last_admin_cannot_be_deleted(session):
    fam = _register(session)
    admin = _add_first_member(fam["account_token"], pin="1234")
    sel = _select_member(fam["account_token"], admin["id"], "1234")
    h = {"Authorization": f"Bearer {sel['member_token']}"}
    r = requests.delete(f"{API}/family/members/{admin['id']}", headers=h, timeout=15)
    assert r.status_code == 400
    assert "last family admin" in r.text.lower()


# ---- Test 7: with second admin, first admin CAN be demoted/deleted ----
def test_second_admin_unlocks_first_admin_demotion_and_deletion(session):
    fam = _register(session)
    a1 = _add_first_member(fam["account_token"], pin="1234")
    sel = _select_member(fam["account_token"], a1["id"], "1234")
    h = {"Authorization": f"Bearer {sel['member_token']}"}

    # Add second member as admin
    r = requests.post(
        f"{API}/family/members",
        json={"name": "TEST_A2", "role": "adult", "pin": "5555", "is_family_admin": True},
        headers=h, timeout=15,
    )
    assert r.status_code == 200
    a2 = r.json()
    assert a2["is_family_admin"] is True

    # Now demote a1
    r = requests.put(
        f"{API}/family/members/{a1['id']}",
        json={"is_family_admin": False}, headers=h, timeout=15,
    )
    assert r.status_code == 200
    assert r.json()["is_family_admin"] is False

    # Re-promote then attempt delete using a2 token (since a1 is no longer admin)
    sel2 = _select_member(fam["account_token"], a2["id"], "5555")
    h2 = {"Authorization": f"Bearer {sel2['member_token']}"}
    # Delete a1 via a2's admin token
    r = requests.delete(f"{API}/family/members/{a1['id']}", headers=h2, timeout=15)
    assert r.status_code == 200


# ---- Test 8: list members never leaks pin_hash; includes is_family_admin ----
def test_list_members_shape(session):
    fam = _register(session)
    admin = _add_first_member(fam["account_token"], pin="1234")
    sel = _select_member(fam["account_token"], admin["id"], "1234")
    h = {"Authorization": f"Bearer {sel['member_token']}"}

    # add a couple of members
    requests.post(f"{API}/family/members", json={"name": "TEST_K1", "role": "child", "pin": "1111"}, headers=h, timeout=15)
    requests.post(f"{API}/family/members", json={"name": "TEST_K2", "role": "adult", "pin": "2222"}, headers=h, timeout=15)

    r = requests.get(f"{API}/family/members", headers=h, timeout=15)
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) >= 3
    for m in rows:
        assert "pin_hash" not in m
        assert "is_family_admin" in m
        assert isinstance(m["is_family_admin"], bool)


# ---- Test 9: multi-tenant isolation ----
def test_multi_tenant_isolation(session):
    famA = _register(session)
    aA = _add_first_member(famA["account_token"], name="TEST_AdminA", pin="1234")
    selA = _select_member(famA["account_token"], aA["id"], "1234")
    hA = {"Authorization": f"Bearer {selA['member_token']}"}
    # Add member to family A
    requests.post(f"{API}/family/members", json={"name": "TEST_OnlyInA", "role": "child", "pin": "1111"}, headers=hA, timeout=15)

    famB = _register(session)
    aB = _add_first_member(famB["account_token"], name="TEST_AdminB", pin="1234")
    selB = _select_member(famB["account_token"], aB["id"], "1234")
    hB = {"Authorization": f"Bearer {selB['member_token']}"}

    # Family B should NOT see family A's members
    r = requests.get(f"{API}/family/members", headers=hB, timeout=15)
    assert r.status_code == 200
    names = [m["name"] for m in r.json()]
    assert "TEST_OnlyInA" not in names
    assert "TEST_AdminA" not in names

    # Family A token cannot access B's specific member
    r = requests.put(
        f"{API}/family/members/{aB['id']}",
        json={"name": "HACKED"},
        headers=hA, timeout=15,
    )
    # Should be 404 (not found in family A's scope)
    assert r.status_code == 404
