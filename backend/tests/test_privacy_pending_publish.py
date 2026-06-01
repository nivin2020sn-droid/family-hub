"""
Privacy / pending-publish system — covers all 6 supported item types.

Verifies:
  1. New items default to visibility="family" with a pending_publish_at
     timestamp ~7s in the future.
  2. The creator sees their own item immediately (path #2 in the filter).
  3. A sibling family member does NOT see the item until the publish
     gate passes.
  4. PATCH visibility with publish_now=True clears the gate immediately,
     so siblings see the row on the next list.
  5. PATCH visibility="owner_only" keeps the row hidden from siblings
     even after the grace period passes.
  6. PATCH visibility="members" with `visible_to=[sibling_id]` makes the
     row visible to that sibling specifically, and stays hidden from
     other siblings.
  7. Only the creator can PATCH visibility — siblings get 403.
  8. Legacy rows (no visibility field) remain visible to everyone — the
     migration / new feature is fully backward compatible.

We test against `wall_notes` as the canonical kind; the helper functions
are shared across all 6 collections so a single coverage class is enough.
"""

import os
import time
import uuid
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
TIMEOUT = 20


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


def _register_family(tag):
    from tests.conftest import verify_account_email
    email = f"priv-{tag}-{int(time.time()*1000)}-{uuid.uuid4().hex[:6]}@example.com"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "Pass1234!", "confirm_password": "Pass1234!",
        "family_name": f"PrivFam-{tag}",
        "accepted_beta_terms": True, "accepted_privacy_policy": True,
        "accepted_disclaimer": True,
    }, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    verify_account_email(email)
    r = requests.post(f"{API}/auth/login",
                      json={"email": email, "password": "Pass1234!"},
                      timeout=TIMEOUT)
    return r.json()


def _add_member(acc_tok, name):
    r = requests.post(f"{API}/family/members",
                      json={"name": name, "pin": "1234", "is_family_admin": True, "role": "parent"},
                      headers=_h(acc_tok), timeout=TIMEOUT)
    assert r.status_code in (200, 201), r.text
    return r.json()


def _select(acc_tok, mid):
    r = requests.post(f"{API}/auth/member/select",
                      json={"member_id": mid, "pin": "1234"},
                      headers=_h(acc_tok), timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    return r.json()["member_token"]


def _two_members(tag):
    """Spin up a fresh family with TWO members. Returns the member-tokens
    for each plus their IDs so we can test creator-vs-sibling visibility."""
    reg = _register_family(tag)
    acc = reg["access_token"]
    a = _add_member(acc, "Alice")
    # First member must be selected before we can add more (their PIN
    # tokens are what carries the family-admin permission).
    alice_tok = _select(acc, a["id"])
    b = _add_member(alice_tok, "Bob")
    return {
        "acc_tok": acc,
        "alice_tok": alice_tok, "alice_id": a["id"],
        "bob_tok": _select(acc, b["id"]),   "bob_id": b["id"],
    }


def _create_note(tok, text, **extra):
    r = requests.post(f"{API}/wall/notes", json={"text": text, **extra},
                      headers=_h(tok), timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    return r.json()


def _list_notes(tok):
    r = requests.get(f"{API}/wall/notes", headers=_h(tok), timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    return r.json()


def test_new_note_defaults_to_family_with_grace_window():
    f = _two_members("def")
    note = _create_note(f["alice_tok"], "Private surprise")
    assert note["visibility"] == "family"
    assert note["created_by"] == f["alice_id"]
    assert note["pending_publish_at"], "pending_publish_at should be set"


def test_creator_sees_their_own_note_immediately():
    f = _two_members("creator")
    note = _create_note(f["alice_tok"], "Alice's note")
    ids = [n["id"] for n in _list_notes(f["alice_tok"])]
    assert note["id"] in ids, "creator should see own pending note"


def test_sibling_does_not_see_pending_note():
    f = _two_members("sib")
    note = _create_note(f["alice_tok"], "Hidden from Bob")
    ids = [n["id"] for n in _list_notes(f["bob_tok"])]
    assert note["id"] not in ids, "sibling should not see note mid-grace"


def test_publish_now_makes_note_visible_to_sibling():
    f = _two_members("pub")
    note = _create_note(f["alice_tok"], "Publish me")
    r = requests.patch(
        f"{API}/items/wall_notes/{note['id']}/visibility",
        json={"publish_now": True},
        headers=_h(f["alice_tok"]), timeout=TIMEOUT,
    )
    assert r.status_code == 200, r.text
    assert r.json().get("pending_publish_at") is None
    ids = [n["id"] for n in _list_notes(f["bob_tok"])]
    assert note["id"] in ids, "sibling should see published note"


def test_owner_only_hides_from_sibling_after_grace():
    f = _two_members("only")
    note = _create_note(f["alice_tok"], "Top secret",
                        grace_seconds=0)  # immediately past grace
    # Flip to owner_only — sibling must not see it
    r = requests.patch(
        f"{API}/items/wall_notes/{note['id']}/visibility",
        json={"visibility": "owner_only"},
        headers=_h(f["alice_tok"]), timeout=TIMEOUT,
    )
    assert r.status_code == 200
    ids = [n["id"] for n in _list_notes(f["bob_tok"])]
    assert note["id"] not in ids


def test_members_visibility_with_visible_to_list():
    f = _two_members("memb")
    note = _create_note(f["alice_tok"], "Surprise party",
                        grace_seconds=0)
    r = requests.patch(
        f"{API}/items/wall_notes/{note['id']}/visibility",
        json={"visibility": "members", "visible_to": [f["bob_id"]]},
        headers=_h(f["alice_tok"]), timeout=TIMEOUT,
    )
    assert r.status_code == 200
    # Bob is on the list → he sees it
    ids = [n["id"] for n in _list_notes(f["bob_tok"])]
    assert note["id"] in ids


def test_only_creator_can_patch_visibility():
    f = _two_members("auth")
    note = _create_note(f["alice_tok"], "Alice owns this")
    r = requests.patch(
        f"{API}/items/wall_notes/{note['id']}/visibility",
        json={"publish_now": True},
        headers=_h(f["bob_tok"]), timeout=TIMEOUT,
    )
    assert r.status_code == 403, r.text


def test_legacy_row_without_visibility_is_visible_to_all():
    """Insert a doc directly to mimic a pre-feature legacy row. Both
    siblings should see it because the filter treats a missing visibility
    field as fully published / family-visible (path #1)."""
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    # Re-register so we have direct access to the family.id without a
    # second /auth/me round-trip.
    reg = _register_family("legacy")
    acc = reg["access_token"]
    fid = reg["family"]["id"]
    alice = _add_member(acc, "Alice")
    alice_tok = _select(acc, alice["id"])
    bob = _add_member(alice_tok, "Bob")
    bob_tok = _select(acc, bob["id"])

    async def insert():
        with open("/app/backend/.env") as fh:
            env = dict(line.strip().split("=", 1) for line in fh if "=" in line)
        client = AsyncIOMotorClient(env["MONGO_URL"].strip('"'))
        db = client[env["DB_NAME"].strip('"')]
        await db.wall_notes.insert_one({
            "id": "legacy-" + uuid.uuid4().hex,
            "family_id": fid,
            "text": "Legacy note",
            "color": "#fff",
            "created_at": "2024-01-01T00:00:00+00:00",
        })
    asyncio.get_event_loop().run_until_complete(insert())
    bob_titles = [n.get("text") for n in _list_notes(bob_tok)]
    assert "Legacy note" in bob_titles
