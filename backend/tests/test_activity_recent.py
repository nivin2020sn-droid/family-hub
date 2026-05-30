"""Backend tests for the WallBoard 'Recent activity by you' feed.

Covers GET /api/activity/recent + log_activity writes from:
  * events POST + DELETE
  * kids-money transactions (income / payment)
  * kids-money goals POST + PUT (true-from-false transition only)
  * family members add (auth_module's own _log_activity)
  * scope=self (default) vs scope=family (admin-only, 403 for non-admin)
  * limit default=3, cap at 20
  * multi-tenant isolation (family A admin never sees family B activity)
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


# ----- helpers -----

def _email(tag="act"):
    return f"qa-{tag}-{int(time.time()*1000)}-{uuid.uuid4().hex[:6]}@example.com"


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


def _register():
    r = requests.post(
        f"{API}/auth/register",
        json={
            "family_name": "TEST_ACT_Family",
            "email": _email(),
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
        headers=_h(token),
        timeout=15,
    )
    assert r.status_code == 200, f"add {name}: {r.status_code} {r.text}"
    return r.json()


def _select(account_token, member_id, pin):
    r = requests.post(
        f"{API}/auth/member/select",
        json={"member_id": member_id, "pin": pin},
        headers=_h(account_token),
        timeout=15,
    )
    assert r.status_code == 200, f"select {member_id}: {r.status_code} {r.text}"
    return r.json()["member_token"]


def _recent(tok, **params):
    r = requests.get(f"{API}/activity/recent", headers=_h(tok), params=params, timeout=15)
    return r


# ----- fixtures -----

@pytest.fixture(scope="module")
def fam_a():
    """Fresh family A with admin Alice (bootstrap)."""
    f = _register()
    alice = _add_member(f["account_token"], "TEST_Alice", "parent", "1234")
    alice_tok = _select(f["account_token"], alice["id"], "1234")
    return {
        "family_id": f["family_id"],
        "account_token": f["account_token"],
        "admin": {"id": alice["id"], "token": alice_tok, "name": "TEST_Alice"},
    }


@pytest.fixture(scope="module")
def fam_b():
    """Fresh family B (for cross-tenant isolation)."""
    f = _register()
    bob = _add_member(f["account_token"], "TEST_Bob", "parent", "1234")
    bob_tok = _select(f["account_token"], bob["id"], "1234")
    kid = _add_member(bob_tok, "TEST_KidB", "child", "3333")
    kid_tok = _select(f["account_token"], kid["id"], "3333")
    # Create activity in B that A must not see.
    requests.post(
        f"{API}/events",
        json={"title": "TEST_B_SecretEvent", "color": "#FF0000", "date": "2026-01-15"},
        headers=_h(bob_tok),
        timeout=15,
    )
    return {
        "family_id": f["family_id"],
        "admin": {"id": bob["id"], "token": bob_tok},
        "kid": {"id": kid["id"], "token": kid_tok},
    }


# ----- 1. fresh family empty -----

def test_fresh_family_admin_recent_empty(fam_a):
    """A brand-new admin (no actions yet beyond bootstrap) has an empty list.

    NOTE: the auth_module logs `member.added` for the FIRST admin add if the
    caller has a member token, but the bootstrap call uses an ACCOUNT token
    (no mid) so it's NOT logged. Hence the list is empty for a fresh admin.
    """
    r = _recent(fam_a["admin"]["token"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert "items" in body and isinstance(body["items"], list)
    assert body["items"] == []


# ----- 2. event.created -----

def test_event_created_logged(fam_a):
    title = f"TEST_Morning_{uuid.uuid4().hex[:6]}"
    r = requests.post(
        f"{API}/events",
        json={"title": title, "color": "#7BC8A4", "date": "2026-01-20"},
        headers=_h(fam_a["admin"]["token"]),
        timeout=15,
    )
    assert r.status_code == 200, r.text
    fam_a["last_event_id"] = r.json()["id"]
    fam_a["last_event_title"] = title

    rec = _recent(fam_a["admin"]["token"]).json()["items"]
    assert any(it["kind"] == "event.created" and it.get("payload", {}).get("title") == title for it in rec), rec


# ----- 3. event.deleted -----

def test_event_deleted_logged(fam_a):
    eid = fam_a["last_event_id"]
    r = requests.delete(f"{API}/events/{eid}", headers=_h(fam_a["admin"]["token"]), timeout=15)
    assert r.status_code == 200, r.text
    rec = _recent(fam_a["admin"]["token"]).json()["items"]
    assert any(it["kind"] == "event.deleted" for it in rec), rec


# ----- 4. member.added (admin adds child via member token) -----

def test_member_added_logged_and_child_select(fam_a):
    kid = _add_member(fam_a["admin"]["token"], "TEST_Suleiman", "child", "3333")
    kid_tok = _select(fam_a["account_token"], kid["id"], "3333")
    fam_a["kid"] = {"id": kid["id"], "token": kid_tok, "name": "TEST_Suleiman"}

    rec = _recent(fam_a["admin"]["token"]).json()["items"]
    found = [it for it in rec if it["kind"] == "member.added"]
    assert found, f"no member.added: {rec}"
    assert found[0]["payload"].get("name") == "TEST_Suleiman"


# ----- 5. kids_money income + payment -----

def test_kids_money_income_and_payment_logged(fam_a):
    tok = fam_a["kid"]["token"]
    r = requests.post(
        f"{API}/kids-money/transactions",
        json={"type": "income", "amount": 10, "description": "TEST_pocket"},
        headers=_h(tok), timeout=15,
    )
    assert r.status_code == 200, r.text
    r = requests.post(
        f"{API}/kids-money/transactions",
        json={"type": "payment", "amount": 3, "description": "TEST_candy"},
        headers=_h(tok), timeout=15,
    )
    assert r.status_code == 200, r.text

    items = _recent(tok, limit=5).json()["items"]
    income = next((it for it in items if it["kind"] == "kids_money.income.added"), None)
    payment = next((it for it in items if it["kind"] == "kids_money.payment.added"), None)
    assert income is not None, items
    assert payment is not None, items
    assert str(income["payload"].get("amount")) in ("10", "10.0")
    assert income["payload"].get("description") == "TEST_pocket"
    assert payment["payload"].get("description") == "TEST_candy"


# ----- 6. goal.created + goal.completed (true-from-false only) -----

def test_goal_created_and_completed_logged(fam_a):
    tok = fam_a["kid"]["token"]
    r = requests.post(
        f"{API}/kids-money/goals",
        json={"name": "TEST_Bike", "target_amount": 5},
        headers=_h(tok), timeout=15,
    )
    assert r.status_code == 200, r.text
    gid = r.json()["id"]

    # Flip to complete -> goal.completed should fire
    r = requests.put(
        f"{API}/kids-money/goals/{gid}",
        json={"is_complete": True},
        headers=_h(tok), timeout=15,
    )
    assert r.status_code == 200, r.text

    items = _recent(tok, limit=10).json()["items"]
    kinds = [it["kind"] for it in items]
    assert "goal.created" in kinds, items
    assert "goal.completed" in kinds, items
    completed_count_after_first = kinds.count("goal.completed")

    # Flip back to false -> NO new entry; flip back to true -> still no NEW entry
    # per the "only true-from-false transition logs" rule. Server actually does
    # log on EACH true-from-false transition, so toggling true->false->true would
    # log a 2nd one. Spec says only the transition true-from-false logs -> we
    # only assert that flipping is_complete=false does NOT log a new
    # `goal.completed` entry.
    r = requests.put(
        f"{API}/kids-money/goals/{gid}",
        json={"is_complete": False},
        headers=_h(tok), timeout=15,
    )
    assert r.status_code == 200, r.text
    items2 = _recent(tok, limit=10).json()["items"]
    kinds2 = [it["kind"] for it in items2]
    assert kinds2.count("goal.completed") == completed_count_after_first, kinds2


# ----- 7. scope=self isolation: child does NOT see admin events -----

def test_scope_self_child_excludes_admin(fam_a):
    items = _recent(fam_a["kid"]["token"], scope="self", limit=20).json()["items"]
    assert all(it["kind"] != "event.created" for it in items), items
    assert all(it["kind"] != "member.added" for it in items), items
    # Child should still see their own income / payment / goal entries
    assert any(it["kind"].startswith("kids_money.") or it["kind"].startswith("goal.") for it in items), items


# ----- 8. scope=family: admin sees ALL, child gets 403 -----

def test_scope_family_admin_sees_all(fam_a):
    items = _recent(fam_a["admin"]["token"], scope="family", limit=20).json()["items"]
    kinds = {it["kind"] for it in items}
    # We expect at least event.created + event.deleted + member.added + kids_money.income.added + kids_money.payment.added + goal.created + goal.completed
    expected_subset = {
        "event.created", "event.deleted", "member.added",
        "kids_money.income.added", "kids_money.payment.added",
        "goal.created", "goal.completed",
    }
    missing = expected_subset - kinds
    assert not missing, f"missing kinds {missing}; got {kinds}"


def test_scope_family_child_forbidden(fam_a):
    r = _recent(fam_a["kid"]["token"], scope="family")
    assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"
    body = r.json()
    msg = (body.get("detail") or body.get("error") or body.get("message") or "")
    assert "admin" in msg.lower(), msg


# ----- 9. limit default=3 + cap at 20 -----

def test_limit_default_is_three(fam_a):
    items = _recent(fam_a["admin"]["token"], scope="family").json()["items"]
    assert len(items) <= 3
    # The admin has more than 3 entries by now (event create + delete + member.added)
    assert len(items) == 3


def test_limit_cap_at_twenty(fam_a):
    # Asking for a huge number should be silently capped to 20.
    items = _recent(fam_a["admin"]["token"], scope="family", limit=500).json()["items"]
    assert len(items) <= 20


# ----- 10. multi-tenant isolation -----

def test_family_a_admin_does_not_see_family_b(fam_a, fam_b):
    items = _recent(fam_a["admin"]["token"], scope="family", limit=20).json()["items"]
    for it in items:
        title = (it.get("payload") or {}).get("title", "")
        assert "TEST_B_SecretEvent" not in title, f"leaked B event into A: {it}"
        name = (it.get("payload") or {}).get("name", "")
        assert "TEST_KidB" not in name, f"leaked B member into A: {it}"


def test_family_b_admin_does_not_see_family_a(fam_a, fam_b):
    items = _recent(fam_b["admin"]["token"], scope="family", limit=20).json()["items"]
    for it in items:
        title = (it.get("payload") or {}).get("title", "")
        assert "TEST_Morning" not in title, f"leaked A event into B: {it}"
        name = (it.get("payload") or {}).get("name", "")
        assert "TEST_Suleiman" not in name, f"leaked A member into B: {it}"
