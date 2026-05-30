"""End-to-end backend tests for the per-member Time Plan / Events feature.

Covers the review request items:
  * Member palette colour is auto-assigned, hex, distinct across consecutive
    members; legacy rows back-fill on GET; PUT color override persists.
  * /api/events visibility & filter rules for admin vs non-admin members.
  * /api/events create/update/delete authorization rules
    (non-admin can only operate on their own events; admin can re-assign).
  * Multi-tenant isolation between two distinct families.
"""
import os
import re
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


# ---------- helpers ----------
def _unique_email(tag: str = "tp") -> str:
    return f"qa-{tag}-{int(time.time()*1000)}-{uuid.uuid4().hex[:6]}@example.com"


def _register() -> dict:
    payload = {
        "family_name": "TEST_TP_Family",
        "email": _unique_email(),
        "password": "Pass1234!",
        "confirm_password": "Pass1234!",
    }
    r = requests.post(f"{API}/auth/register", json=payload, timeout=15)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    j = r.json()
    return {"account_token": j["access_token"], "family_id": j["family"]["id"]}


def _add_member(account_token: str, name: str, pin: str, role: str = "parent") -> dict:
    r = requests.post(
        f"{API}/family/members",
        json={"name": name, "role": role, "pin": pin},
        headers={"Authorization": f"Bearer {account_token}"},
        timeout=15,
    )
    assert r.status_code == 200, f"add member ({name}) failed: {r.status_code} {r.text}"
    return r.json()


def _add_member_via_member_token(member_token: str, name: str, pin: str, role: str = "parent") -> dict:
    """When an admin already exists, additional members must be added with a
    member admin token (per the existing family_members tests)."""
    r = requests.post(
        f"{API}/family/members",
        json={"name": name, "role": role, "pin": pin},
        headers={"Authorization": f"Bearer {member_token}"},
        timeout=15,
    )
    assert r.status_code == 200, f"add member ({name}) failed: {r.status_code} {r.text}"
    return r.json()


def _select_member(account_token: str, member_id: str, pin: str) -> str:
    r = requests.post(
        f"{API}/auth/member/select",
        json={"member_id": member_id, "pin": pin},
        headers={"Authorization": f"Bearer {account_token}"},
        timeout=15,
    )
    assert r.status_code == 200, f"select member failed: {r.status_code} {r.text}"
    return r.json()["member_token"]


def _h(member_token: str) -> dict:
    return {"Authorization": f"Bearer {member_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def family_a():
    """Family A: 1 admin (Alice) + 2 non-admin members (Bob, Carol)."""
    fam = _register()
    alice = _add_member(fam["account_token"], "TEST_Alice", "1234")
    alice_token = _select_member(fam["account_token"], alice["id"], "1234")
    bob = _add_member_via_member_token(alice_token, "TEST_Bob", "2222")
    carol = _add_member_via_member_token(alice_token, "TEST_Carol", "3333", role="child")
    bob_token = _select_member(fam["account_token"], bob["id"], "2222")
    carol_token = _select_member(fam["account_token"], carol["id"], "3333")
    return {
        "family_id": fam["family_id"],
        "account_token": fam["account_token"],
        "alice": alice, "alice_token": alice_token,
        "bob": bob, "bob_token": bob_token,
        "carol": carol, "carol_token": carol_token,
    }


@pytest.fixture(scope="module")
def family_b():
    """Independent family for tenant isolation."""
    fam = _register()
    admin = _add_member(fam["account_token"], "TEST_BAdmin", "9999")
    admin_token = _select_member(fam["account_token"], admin["id"], "9999")
    return {
        "family_id": fam["family_id"],
        "account_token": fam["account_token"],
        "admin": admin, "admin_token": admin_token,
    }


# ============================================================
# Colour palette tests
# ============================================================

def test_first_member_has_hex_color(family_a):
    """Bootstrap admin gets a non-empty hex color."""
    c = family_a["alice"].get("color")
    assert c, "First member must have a non-empty color"
    assert HEX_RE.match(c), f"Expected 7-char hex, got {c!r}"


def test_consecutive_members_get_distinct_colors(family_a):
    a, b, c = family_a["alice"]["color"], family_a["bob"]["color"], family_a["carol"]["color"]
    for col in (a, b, c):
        assert HEX_RE.match(col), f"Not a hex color: {col!r}"
    assert len({a, b, c}) == 3, f"Colors should be distinct, got {a}, {b}, {c}"


def test_get_members_returns_color_persisted(family_a):
    """GET /api/family/members must return the same colour as POST persisted."""
    r = requests.get(f"{API}/family/members", headers=_h(family_a["alice_token"]), timeout=15)
    assert r.status_code == 200, r.text
    rows = {m["id"]: m for m in r.json()}
    assert rows[family_a["alice"]["id"]]["color"] == family_a["alice"]["color"]
    assert rows[family_a["bob"]["id"]]["color"] == family_a["bob"]["color"]
    assert rows[family_a["carol"]["id"]]["color"] == family_a["carol"]["color"]


def test_put_color_override_persists(family_a):
    """Admin can override a member's colour via PUT and it persists."""
    new_color = "#123ABC"
    r = requests.put(
        f"{API}/family/members/{family_a['bob']['id']}",
        json={"color": new_color},
        headers=_h(family_a["alice_token"]),
        timeout=15,
    )
    assert r.status_code == 200, r.text
    assert r.json()["color"] == new_color

    # Verify on subsequent GET
    r2 = requests.get(f"{API}/family/members", headers=_h(family_a["alice_token"]), timeout=15)
    rows = {m["id"]: m for m in r2.json()}
    assert rows[family_a["bob"]["id"]]["color"] == new_color
    # restore so later tests are not affected
    requests.put(
        f"{API}/family/members/{family_a['bob']['id']}",
        json={"color": family_a["bob"]["color"]},
        headers=_h(family_a["alice_token"]),
        timeout=15,
    )


# ============================================================
# Events: visibility / owner filter
# ============================================================

def _create_event(member_token: str, date: str, title: str, user_id: str | None = None,
                  color: str = "#60A5FA") -> "requests.Response":
    body = {"date": date, "title": title, "color": color}
    if user_id is not None:
        body["user_id"] = user_id
    r = requests.post(f"{API}/events", json=body, headers=_h(member_token), timeout=15)
    return r


def test_post_event_non_admin_defaults_owner_to_self(family_a):
    r = _create_event(family_a["bob_token"], "2030-01-10", "TEST_BobEvent")
    assert r.status_code == 200, r.text
    ev = r.json()
    assert ev["user_id"] == family_a["bob"]["id"]
    assert ev["owner_member_id"] == family_a["bob"]["id"]


def test_post_event_non_admin_for_other_returns_403(family_a):
    r = _create_event(family_a["bob_token"], "2030-01-11", "TEST_Forbidden",
                      user_id=family_a["alice"]["id"])
    assert r.status_code == 403, r.text
    assert "admin" in r.text.lower()


def test_post_event_admin_for_another_member_succeeds(family_a):
    r = _create_event(family_a["alice_token"], "2030-01-12", "TEST_AdminForCarol",
                      user_id=family_a["carol"]["id"])
    assert r.status_code == 200, r.text
    ev = r.json()
    assert ev["user_id"] == family_a["carol"]["id"]
    assert ev["owner_member_id"] == family_a["carol"]["id"]


def test_get_events_non_admin_sees_only_own_even_with_filter(family_a):
    """Bob asks for Alice's events; backend MUST still return only Bob's."""
    r = requests.get(
        f"{API}/events",
        params={"user_id": family_a["alice"]["id"]},
        headers=_h(family_a["bob_token"]),
        timeout=15,
    )
    assert r.status_code == 200, r.text
    owners = {e.get("owner_member_id") or e.get("user_id") for e in r.json()}
    if owners:
        assert owners == {family_a["bob"]["id"]}, f"Non-admin saw foreign events: {owners}"


def test_get_events_admin_no_filter_returns_all_family_events(family_a):
    # seed an Alice event so we have multiple owners
    _create_event(family_a["alice_token"], "2030-01-13", "TEST_AliceEvent")
    r = requests.get(f"{API}/events", headers=_h(family_a["alice_token"]), timeout=15)
    assert r.status_code == 200, r.text
    owners = {e.get("owner_member_id") or e.get("user_id") for e in r.json()}
    # We have Bob's, Carol's (via admin), and Alice's events
    assert family_a["bob"]["id"] in owners
    assert family_a["carol"]["id"] in owners
    assert family_a["alice"]["id"] in owners


def test_get_events_admin_user_ids_filters_to_those_owners(family_a):
    csv = f"{family_a['bob']['id']},{family_a['carol']['id']}"
    r = requests.get(
        f"{API}/events",
        params={"user_ids": csv},
        headers=_h(family_a["alice_token"]),
        timeout=15,
    )
    assert r.status_code == 200, r.text
    owners = {e.get("owner_member_id") or e.get("user_id") for e in r.json()}
    assert family_a["alice"]["id"] not in owners, "user_ids filter must exclude Alice"
    assert owners.issubset({family_a["bob"]["id"], family_a["carol"]["id"]})


# ============================================================
# Events: update / delete authorization
# ============================================================

def test_put_event_other_non_admin_returns_403(family_a):
    # Bob creates → Carol tries to edit
    r1 = _create_event(family_a["bob_token"], "2030-02-01", "TEST_BobOwned")
    assert r1.status_code == 200
    eid = r1.json()["id"]
    r2 = requests.put(
        f"{API}/events/{eid}",
        json={"title": "Hijack"},
        headers=_h(family_a["carol_token"]),
        timeout=15,
    )
    assert r2.status_code == 403, r2.text


def test_put_event_admin_can_reassign_owner(family_a):
    r1 = _create_event(family_a["bob_token"], "2030-02-02", "TEST_Reassign")
    eid = r1.json()["id"]
    r2 = requests.put(
        f"{API}/events/{eid}",
        json={"user_id": family_a["carol"]["id"]},
        headers=_h(family_a["alice_token"]),
        timeout=15,
    )
    assert r2.status_code == 200, r2.text
    ev = r2.json()
    assert ev["user_id"] == family_a["carol"]["id"]
    assert ev["owner_member_id"] == family_a["carol"]["id"]


def test_delete_event_owner_succeeds_other_member_403(family_a):
    # Bob creates two; Carol cannot delete; Bob can
    r1 = _create_event(family_a["bob_token"], "2030-02-03", "TEST_DelByOwner")
    eid1 = r1.json()["id"]
    r2 = _create_event(family_a["bob_token"], "2030-02-04", "TEST_DelByOther")
    eid2 = r2.json()["id"]

    rb = requests.delete(f"{API}/events/{eid1}", headers=_h(family_a["bob_token"]), timeout=15)
    assert rb.status_code == 200, rb.text

    rc = requests.delete(f"{API}/events/{eid2}", headers=_h(family_a["carol_token"]), timeout=15)
    assert rc.status_code == 403, rc.text

    # Admin deletes the leftover
    ra = requests.delete(f"{API}/events/{eid2}", headers=_h(family_a["alice_token"]), timeout=15)
    assert ra.status_code == 200, ra.text


# ============================================================
# Multi-tenant isolation
# ============================================================

def test_family_b_cannot_see_family_a_events(family_a, family_b):
    # Create an event in family_a (owned by Alice)
    r1 = _create_event(family_a["alice_token"], "2030-03-01", "TEST_FamA_only")
    assert r1.status_code == 200
    fa_event_id = r1.json()["id"]

    # Family B admin lists events → must NOT see family A
    r = requests.get(f"{API}/events", headers=_h(family_b["admin_token"]), timeout=15)
    assert r.status_code == 200, r.text
    ids = {e["id"] for e in r.json()}
    assert fa_event_id not in ids

    # Family B admin tries to edit family A's event → 404 (out of scope)
    r2 = requests.put(
        f"{API}/events/{fa_event_id}",
        json={"title": "Hijack across tenants"},
        headers=_h(family_b["admin_token"]),
        timeout=15,
    )
    # Backend treats out-of-tenant rows as not found OR 403; either way it must not succeed.
    assert r2.status_code in (403, 404), r2.text

    # And cannot delete either
    r3 = requests.delete(f"{API}/events/{fa_event_id}", headers=_h(family_b["admin_token"]), timeout=15)
    assert r3.status_code in (403, 404), r3.text
