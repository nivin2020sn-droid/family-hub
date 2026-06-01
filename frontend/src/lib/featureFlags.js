// Global feature-flags client. A single module-level promise caches the
// public /api/feature-flags response so concurrent callers share the same
// network request. The flags are reloaded once per minute to pick up
// changes the admin makes without forcing a hard page reload.

import { useEffect, useState } from "react";
import axios from "axios";

const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");
const TTL_MS = 60 * 1000;

const DEFAULTS = { locator_enabled: false, family_locator_enabled: false };

let cached = null;
let cachedAt = 0;
let inflight = null;

async function fetchFlags() {
  try {
    const r = await axios.get(`${BACKEND_URL}/api/feature-flags`, { timeout: 8000 });
    return { ...DEFAULTS, ...(r.data || {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Returns the cached flags, refetching when older than TTL_MS.
 *  Safe to call from non-React code (e.g. event handlers, services). */
export async function getFeatureFlags(force = false) {
  const now = Date.now();
  if (!force && cached && now - cachedAt < TTL_MS) return cached;
  if (!inflight) {
    inflight = fetchFlags().then((flags) => {
      cached = flags;
      cachedAt = Date.now();
      inflight = null;
      return flags;
    });
  }
  return inflight;
}

/** Hook variant — returns `{ flags, ready }`. `ready` flips to true once
 *  the first response lands so the UI can render placeholders meanwhile. */
export function useFeatureFlags() {
  const [flags, setFlags] = useState(cached || DEFAULTS);
  const [ready, setReady] = useState(!!cached);
  useEffect(() => {
    let cancelled = false;
    getFeatureFlags().then((f) => {
      if (!cancelled) {
        setFlags(f);
        setReady(true);
      }
    });
    return () => { cancelled = true; };
  }, []);
  return { flags, ready };
}

/** Bust the cache — call after the admin toggles a flag so the next read
 *  hits the server. */
export function invalidateFeatureFlags() {
  cached = null;
  cachedAt = 0;
}
