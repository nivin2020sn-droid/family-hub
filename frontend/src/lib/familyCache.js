// Family-scoped localStorage cache.
//
// PROBLEM (data-isolation bug, Feb 2026): the original cache helpers in
// api.js, wallApi.js and locationApi.js wrote to fixed keys like
// `mfml_cache_events` or `wall_cache:coll:notes`. When a user logged out and
// signed into a DIFFERENT family on the same browser, those stale entries
// leaked across tenants — and worse, on a transient API failure the code
// fell back to that stale cache, showing family A's data inside family B.
//
// FIX: every cache read/write goes through this helper. Keys are prefixed
// with the current family id, so two families never share a storage slot.
// When the family id is unknown (no session yet) we bypass the cache
// entirely instead of leaking into a global namespace.

import { getFamily } from "@/lib/auth";

const FAMILY_KEY_PREFIX = "mfml_cache:fam:";

// All cache namespaces that should be wiped on logout / family switch. Keep
// this list in sync with anything that writes via familyCache.write().
const NAMESPACES = [
  "events",
  "eventTypes",
  "users",
  "wall:coll:notes",
  "wall:coll:goals",
  "wall:coll:countdown",
  "wall:coll:photos",
  "wall:coll:achievements",
  "wall:coll:family_events",
  "wall:settings",
  "wall:profiles",
  "locations",
];

function currentFamilyId() {
  try {
    const fam = getFamily();
    return fam && fam.id ? String(fam.id) : null;
  } catch {
    return null;
  }
}

function fullKey(ns) {
  const fid = currentFamilyId();
  if (!fid) return null;
  return `${FAMILY_KEY_PREFIX}${fid}:${ns}`;
}

export const familyCache = {
  read(ns) {
    const k = fullKey(ns);
    if (!k) return null;
    try {
      const raw = localStorage.getItem(k);
      return raw == null ? null : JSON.parse(raw);
    } catch {
      return null;
    }
  },
  write(ns, value) {
    const k = fullKey(ns);
    if (!k) return;
    try {
      localStorage.setItem(k, JSON.stringify(value));
    } catch {
      /* quota or unavailable */
    }
  },
  remove(ns) {
    const k = fullKey(ns);
    if (!k) return;
    try {
      localStorage.removeItem(k);
    } catch {}
  },
};

// Wipe every key that belongs to family-scoped data. Called from
// `auth.logout()` and right before a new family/member session is
// established. Idempotent.
export function purgeAllFamilyCaches() {
  if (typeof localStorage === "undefined") return;
  try {
    const stale = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      // Scoped helper writes
      if (k.startsWith(FAMILY_KEY_PREFIX)) stale.push(k);
      // Legacy keys still present from older builds — wipe them too so we
      // never accidentally read them after the migration.
      if (
        k === "mfml_cache_events" ||
        k === "mfml_cache_event_types" ||
        k === "mfml_cache_users" ||
        k === "family_locations_latest" ||
        k === "wall_outbox" ||
        k.startsWith("wall_cache:") ||
        k.startsWith("mfml_cache_events_")
      ) {
        stale.push(k);
      }
    }
    stale.forEach((k) => {
      try { localStorage.removeItem(k); } catch {}
    });
  } catch {}
}

export const CACHE_NAMESPACES = NAMESPACES;
