"""Smoke-test the privacy / pending-publish fields across ALL 6 item kinds.

The deep behavioural tests live in `test_privacy_pending_publish.py` (which
focuses on `wall_notes`). This module just verifies that the other 5
kinds:
  - return `visibility`, `created_by`, `pending_publish_at` on create
  - accept PATCH /api/items/<kind>/<id>/visibility with publish_now=True

Kinds covered: wall_goals, wall_countdown, wall_family_events,
shopping_items, routines.
"""
import os
import time
import uuid
import requests
import pytest

from tests.test_privacy_pending_publish import _two_members, _h, API

TIMEOUT = 20


# Each tuple: (kind, list_path, create_path, create_body)
KINDS = [
    ("wall_goals",        "/wall/goals",        "/wall/goals",
        {"label": "Climb a mountain"}),
    ("wall_countdown",    "/wall/countdown",    "/wall/countdown",
        {"label": "Birthday", "date": "2030-01-01"}),
    ("wall_family_events","/wall/family-events","/wall/family-events",
        {"title": "Family dinner", "date": "2030-01-01"}),
    ("shopping_items",    "/shopping",          "/shopping",
        {"name": "Milk"}),
    ("routines",          "/routines",          "/routines",
        {"title": "Morning teeth", "recurrence_type": "days", "recurrence_interval": 1}),
]


@pytest.mark.parametrize("kind,list_path,create_path,body", KINDS,
                         ids=[k[0] for k in KINDS])
def test_kind_creates_with_visibility_fields_and_patch_publishes(
    kind, list_path, create_path, body
):
    f = _two_members(f"kind-{kind[:5]}")
    r = requests.post(f"{API}{create_path}", json=body,
                      headers=_h(f["alice_tok"]), timeout=TIMEOUT)
    assert r.status_code in (200, 201), f"{kind} create: {r.status_code} {r.text}"
    doc = r.json()
    assert doc.get("visibility") == "family", f"{kind}: visibility={doc.get('visibility')}"
    assert doc.get("created_by") == f["alice_id"], f"{kind}: created_by missing"
    assert doc.get("pending_publish_at"), f"{kind}: pending_publish_at missing"

    item_id = doc["id"]

    # Mid-grace: sibling Bob should NOT see it
    r = requests.get(f"{API}{list_path}", headers=_h(f["bob_tok"]), timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    ids = [x.get("id") for x in r.json()]
    assert item_id not in ids, f"{kind}: sibling saw pending item"

    # publish_now → cleared
    r = requests.patch(
        f"{API}/items/{kind}/{item_id}/visibility",
        json={"publish_now": True},
        headers=_h(f["alice_tok"]), timeout=TIMEOUT,
    )
    assert r.status_code == 200, f"{kind} patch: {r.status_code} {r.text}"
    assert r.json().get("pending_publish_at") is None

    # Sibling Bob now sees it
    r = requests.get(f"{API}{list_path}", headers=_h(f["bob_tok"]), timeout=TIMEOUT)
    ids = [x.get("id") for x in r.json()]
    assert item_id in ids, f"{kind}: sibling didn't see published item"
