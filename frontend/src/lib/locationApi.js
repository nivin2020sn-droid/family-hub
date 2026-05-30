// Frontend client for the family-location feature.
//
// Reads are best-effort: we cache the latest known positions in localStorage
// so the map still has something to render when the device goes offline.

import axios from "axios";
import { getFamilyCode } from "./auth";
import { attachAuth } from "./authInterceptor";

// Make sure every axios call below carries the family JWT — without it the
// tenant middleware can't scope the request and returns an empty result.
attachAuth(axios);

const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");

const CACHE_KEY = "family_locations_latest";

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function writeCache(value) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

export function cachedLatest() {
  return readCache();
}

export async function fetchLatest() {
  try {
    const res = await axios.get(BACKEND_URL + "/api/location/latest", {
      timeout: 10000,
    });
    const data = Array.isArray(res.data) ? res.data : [];
    writeCache(data);
    return data;
  } catch {
    return readCache();
  }
}

export async function fetchHistory(memberId, opts = {}) {
  const params = { memberId };
  // Accept either a {date} string, an explicit {start, end} ISO range, or
  // a plain string (legacy "YYYY-MM-DD" call signature).
  if (typeof opts === "string") {
    params.date = opts;
  } else if (opts.start && opts.end) {
    params.start = opts.start;
    params.end = opts.end;
  } else if (opts.date) {
    params.date = opts.date;
  }
  try {
    const res = await axios.get(BACKEND_URL + "/api/location/history", {
      params,
      timeout: 15000,
    });
    return Array.isArray(res.data) ? res.data : [];
  } catch {
    return [];
  }
}

// Remove a tracked member and ALL their history. Used by the "trash" button
// on each member card to clean up stale device identities. Returns
// { ok: true } on success and throws an Error otherwise so the UI can react.
export async function deleteMember(memberId) {
  const code = getFamilyCode();
  if (!code) {
    throw new Error("Family code missing — please sign in again.");
  }
  try {
    const res = await axios.delete(
      `${BACKEND_URL}/api/location/member/${encodeURIComponent(memberId)}`,
      { params: { familyCode: code }, timeout: 12000 }
    );
    // Refresh local cache so subsequent reads don't resurrect the deleted row.
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          const next = list.filter((m) => m.id !== memberId);
          localStorage.setItem(CACHE_KEY, JSON.stringify(next));
        }
      }
    } catch {
      /* ignore cache errors */
    }
    return res.data || { ok: true };
  } catch (err) {
    const status = err && err.response && err.response.status;
    if (status === 401) throw new Error("Invalid family code");
    if (status === 404) throw new Error("Member not found");
    throw new Error("Could not delete member. Please try again.");
  }
}
