// Backend API helpers for the privacy / pending-publish system.

import { api } from "./api";

/**
 * Patch the visibility / publish state of an existing item. Body can
 * include any combination of:
 *   - visibility:  "family" | "owner_only" | "members"
 *   - visible_to:  string[]  (member ids — only meaningful for "members")
 *   - publish_now: boolean   (when true, clears the grace period)
 *
 * Only the creator can patch — backend returns 403 for anyone else.
 */
export async function patchItemVisibility(kind, id, body) {
  const r = await api.patch(`/items/${kind}/${id}/visibility`, body);
  return r.data;
}

/** Shortcut — publish immediately (clears `pending_publish_at`). */
export function publishNow(kind, id) {
  return patchItemVisibility(kind, id, { publish_now: true });
}

/** Shortcut — set "owner only" privacy and publish. */
export function makeOwnerOnly(kind, id) {
  return patchItemVisibility(kind, id, { visibility: "owner_only", publish_now: true });
}

/** Shortcut — set "specific members" privacy and publish. */
export function shareWithMembers(kind, id, memberIds) {
  return patchItemVisibility(kind, id, {
    visibility: "members",
    visible_to: memberIds,
    publish_now: true,
  });
}

/** Shortcut — set back to "family" and publish. */
export function shareWithFamily(kind, id) {
  return patchItemVisibility(kind, id, { visibility: "family", publish_now: true });
}

/**
 * The 6 kinds the backend currently supports for visibility patches.
 * Keep this in sync with `_PRIVACY_COLLECTIONS` in /app/backend/server.py.
 */
export const PRIVACY_KINDS = Object.freeze({
  notes: "wall_notes",
  goals: "wall_goals",
  countdown: "wall_countdown",
  familyEvents: "wall_family_events",
  shopping: "shopping_items",
  routines: "routines",
});
