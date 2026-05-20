// Frontend client for the family-location feature.
//
// Reads are best-effort: we cache the latest known positions in localStorage
// so the map still has something to render when the device goes offline.

import axios from "axios";

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

export async function fetchHistory(memberId, date) {
  const params = { memberId };
  if (date) params.date = date;
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
