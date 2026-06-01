"""
Privacy / pending-publish system for shareable family items.

The idea: when a member creates an item (Note, Goal, Shopping item, etc.),
the item is persisted IMMEDIATELY but stays invisible to other family
members for a short grace period (7 seconds by default). During that
window the creator can change the visibility, publish early, or undo
(delete) the item. After the window passes — or as soon as the creator
explicitly publishes — the item becomes visible to whoever the
visibility rules allow.

Three visibility modes:
  - "family":     visible to every family member once published (default).
  - "owner_only": never visible to anyone but the creator (private).
  - "members":    visible only to the explicitly-listed `visible_to` ids.

The creator ALWAYS sees their own items, regardless of mode or the
pending-publish countdown — they need to be able to track what they
just created.

Storage shape on the doc:
  - `visibility`:        "family" | "owner_only" | "members"
  - `visible_to`:        list of member ids (only used when visibility="members")
  - `created_by`:        member id of the creator
  - `pending_publish_at`: ISO datetime — when it passes, the item is
                          considered published. `None` means already
                          published (which is also true if the field is
                          missing — legacy rows from before this feature).

Legacy compatibility: rows created before this feature have NONE of the
fields above. The filter helper treats `visibility` missing as "family"
and `pending_publish_at` missing as "already published", so the existing
data continues to behave exactly as before.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from tenant import current_member_id

# Default grace period the UI countdown uses. Server enforces this same
# value when the client doesn't override it on create.
DEFAULT_GRACE_SECONDS = 7

# The three valid `visibility` modes. Anything else is a 400 from the
# create / patch handlers.
VISIBILITY_MODES = {"family", "owner_only", "members"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def build_visibility_fields(
    payload: dict,
    grace_seconds: int = DEFAULT_GRACE_SECONDS,
) -> dict:
    """Return the visibility-related fields to merge into a NEW doc.

    Reads from the create payload:
      - `visibility`    (default "family")
      - `visible_to`    (default [])
      - `grace_seconds` (default DEFAULT_GRACE_SECONDS) — letting the
        client request a shorter / longer window is harmless; the server
        still controls when the item is considered published.

    Always overrides `created_by` from the request context — never trust
    a client-supplied creator id.
    """
    visibility = (payload.get("visibility") or "family").lower()
    if visibility not in VISIBILITY_MODES:
        visibility = "family"
    visible_to = payload.get("visible_to") or []
    if not isinstance(visible_to, list):
        visible_to = []
    grace = int(payload.get("grace_seconds") or grace_seconds)
    grace = max(0, min(grace, 60))  # hard cap so a buggy client can't
                                    # park an item invisible forever
    now = _now()
    return {
        "visibility": visibility,
        "visible_to": [str(x) for x in visible_to],
        "created_by": current_member_id.get(),
        # Publishing immediately (`grace=0`) is supported — the item
        # becomes visible the moment the doc lands.
        "pending_publish_at": (now + timedelta(seconds=grace)).isoformat()
        if grace > 0
        else None,
        "created_at_publish": now.isoformat(),
    }


def visibility_filter(member_id: Optional[str]) -> dict:
    """Return the Mongo `$or` clause that decides which docs a viewer
    with `member_id` can see. AND this with the rest of your query.

    Three permissive paths:
      1. Doc has no `visibility` field at all → legacy row, visible to
         the entire family (matches pre-feature behaviour).
      2. Doc's `created_by` equals the viewer → creator always sees
         their own work, even mid-countdown.
      3. The publish gate has passed (no `pending_publish_at` OR it's
         in the past) AND the visibility rule allows the viewer:
            * visibility="family"  → always allowed
            * visibility="members" → viewer in `visible_to`
            * visibility="owner_only" — never allowed for non-creators,
              so we just don't list it here.
    """
    now_iso = _now().isoformat()
    published_gate = {
        "$or": [
            {"pending_publish_at": {"$exists": False}},
            {"pending_publish_at": None},
            {"pending_publish_at": {"$lte": now_iso}},
        ]
    }
    rule_clauses = [
        # Legacy rows: no field at all → treat as family-visible.
        {"visibility": {"$exists": False}},
        {"visibility": "family"},
    ]
    if member_id:
        rule_clauses.append({
            "visibility": "members",
            "visible_to": member_id,
        })

    or_clauses = [
        # Path #1 + #3 — published row that visibility rule allows.
        {"$and": [published_gate, {"$or": rule_clauses}]},
    ]
    if member_id:
        # Path #2 — creator always sees their own row.
        or_clauses.append({"created_by": member_id})
    return {"$or": or_clauses}


def merge_filter(base: dict, member_id: Optional[str]) -> dict:
    """Convenience helper — merge `base` with the visibility filter so
    routes don't have to write `$and` by hand."""
    vf = visibility_filter(member_id)
    if not base:
        return vf
    return {"$and": [base, vf]}


def can_view(doc: dict, member_id: Optional[str]) -> bool:
    """In-process mirror of `visibility_filter` — used for after-the-fact
    visibility checks (e.g. when the route fetches a single doc by id and
    needs to decide whether to return it or 404)."""
    # Legacy rows.
    if "visibility" not in doc:
        return True
    if member_id and doc.get("created_by") == member_id:
        return True
    # Publish gate.
    p = doc.get("pending_publish_at")
    if p:
        try:
            # Strings compare correctly as ISO 8601 — but be defensive.
            if p > _now().isoformat():
                return False
        except TypeError:
            return False
    visibility = doc.get("visibility") or "family"
    if visibility == "family":
        return True
    if visibility == "owner_only":
        return False  # not the creator (handled above) → blocked
    if visibility == "members":
        return bool(member_id) and member_id in (doc.get("visible_to") or [])
    return False


def parse_patch_visibility(body: dict) -> dict:
    """Build the `$set` update payload for a PATCH /visibility request.

    Recognised body keys:
      - `visibility`:  "family" | "owner_only" | "members"
      - `visible_to`:  list of member ids (only meaningful for "members")
      - `publish_now`: bool — when true, sets `pending_publish_at=None`
                       so the item appears for everyone immediately.

    Returns an empty dict when nothing is being updated.
    """
    update: dict = {}
    if "visibility" in body:
        v = (body.get("visibility") or "").lower()
        if v not in VISIBILITY_MODES:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail=f"visibility must be one of {sorted(VISIBILITY_MODES)}")
        update["visibility"] = v
    if "visible_to" in body:
        lst = body.get("visible_to") or []
        update["visible_to"] = [str(x) for x in lst]
    if body.get("publish_now"):
        # Any visibility change implicitly publishes — there's no reason
        # to keep the grace period active once the creator has actively
        # made a decision.
        update["pending_publish_at"] = None
    # Explicit publish_now=true with no visibility change still publishes.
    elif "visibility" in body or "visible_to" in body:
        update["pending_publish_at"] = None
    return update
