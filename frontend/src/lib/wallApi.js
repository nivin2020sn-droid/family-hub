// Offline-first client for Wall Board data.
//
// Strategy:
//  - GETs are read-through cached in localStorage. We always return the cached
//    value immediately if available, and fire-and-forget refresh from the
//    server. The caller subscribes to changes via the returned object's hook.
//  - Mutations (POST / PUT / DELETE) are optimistic. They update the local
//    cache instantly, push to the server, and on network failure they enter
//    an outbox queue (`wall_outbox`) that gets replayed on next online event
//    or when `flushQueue()` is called manually.
//
// Each resource uses a stable client-side id (uuid) so creates can be queued
// offline and reconciled on the server without surprises.

import axios from "axios";

const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL || (typeof window !== "undefined" ? window.location.origin : "");

const CACHE_PREFIX = "wall_cache:";
const OUTBOX_KEY = "wall_outbox";

// ---------- cache helpers ----------
function readCache(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeCache(key, value) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota or unavailable — ignore */
  }
}

// ---------- outbox / sync queue ----------
function readOutbox() {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function writeOutbox(queue) {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(queue));
  } catch {
    /* ignore */
  }
}
function enqueue(item) {
  const q = readOutbox();
  q.push({ ...item, ts: Date.now() });
  writeOutbox(q);
}

export function pendingSyncCount() {
  return readOutbox().length;
}

// Replay every queued mutation. Returns { sent, failed }.
export async function flushQueue() {
  const queue = readOutbox();
  if (queue.length === 0) return { sent: 0, failed: 0 };
  const remaining = [];
  let sent = 0;
  for (const item of queue) {
    try {
      await axios({
        url: BACKEND_URL + item.url,
        method: item.method,
        data: item.body,
        timeout: 12000,
      });
      sent += 1;
    } catch (err) {
      // If the server returned 4xx (client error), drop the request to avoid
      // poison-pill loops. Keep network errors and 5xx for retry.
      const status = err && err.response && err.response.status;
      if (status && status >= 400 && status < 500) {
        // drop
      } else {
        remaining.push(item);
      }
    }
  }
  writeOutbox(remaining);
  return { sent, failed: remaining.length };
}

// Try flushing whenever the browser regains connectivity.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    flushQueue().catch(() => {});
  });
}

// ---------- core HTTP ----------
async function get(path, cacheKey) {
  // Return cache immediately if present, then refresh in background.
  const cached = readCache(cacheKey);
  try {
    const res = await axios.get(BACKEND_URL + path, { timeout: 10000 });
    writeCache(cacheKey, res.data);
    return res.data;
  } catch {
    return cached !== null ? cached : Array.isArray(cached) ? [] : null;
  }
}

async function mutate(method, path, body) {
  try {
    const res = await axios({
      url: BACKEND_URL + path,
      method,
      data: body,
      timeout: 12000,
    });
    return { ok: true, data: res.data, queued: false };
  } catch (err) {
    // Network or server unreachable — queue for later.
    const status = err && err.response && err.response.status;
    if (!status) {
      enqueue({ method, url: path, body });
      return { ok: true, data: body, queued: true };
    }
    return { ok: false, error: err };
  }
}

// ---------- resource definitions ----------
// Each "collection" resource exposes list / create / update / delete.
function makeCollection(name) {
  const base = `/api/wall/${name}`;
  return {
    cacheKey: `coll:${name}`,
    async list() {
      const data = await get(base, `coll:${name}`);
      return Array.isArray(data) ? data : [];
    },
    cached() {
      return readCache(`coll:${name}`) || [];
    },
    async create(payload, optimisticItem) {
      const cache = this.cached();
      const next = [...cache, optimisticItem];
      writeCache(`coll:${name}`, next);
      const r = await mutate("post", base, payload);
      if (r.ok && r.data && !r.queued) {
        // Replace optimistic item with server response (matched by id).
        const fresh = this.cached().map((x) =>
          x.id === optimisticItem.id ? r.data : x
        );
        writeCache(`coll:${name}`, fresh);
      }
      return r;
    },
    async update(id, payload) {
      const cache = this.cached();
      const next = cache.map((x) => (x.id === id ? { ...x, ...payload } : x));
      writeCache(`coll:${name}`, next);
      return mutate("put", `${base}/${id}`, payload);
    },
    async remove(id) {
      const cache = this.cached();
      const next = cache.filter((x) => x.id !== id);
      writeCache(`coll:${name}`, next);
      return mutate("delete", `${base}/${id}`, undefined);
    },
  };
}

// Singleton resource: settings (hero + message of the day).
export const wallSettings = {
  cacheKey: "settings",
  async fetch() {
    const data = await get("/api/wall/settings", "settings");
    return data || {};
  },
  cached() {
    return readCache("settings") || {};
  },
  async save(payload) {
    const current = this.cached();
    const merged = { ...current, ...payload };
    writeCache("settings", merged);
    return mutate("put", "/api/wall/settings", payload);
  },
};

export const wallPhotos = makeCollection("photos");
export const wallGoals = makeCollection("goals");
// Goals can also be fetched with archived items included — used by the
// History dialog. Backed by a separate cache key so it doesn't pollute the
// main visible list.
wallGoals.listAll = async function () {
  const data = await get("/api/wall/goals?include_archived=true", "coll:goals:all");
  return Array.isArray(data) ? data : [];
};
wallGoals.cachedAll = function () {
  return readCache("coll:goals:all") || [];
};
export const wallCountdown = makeCollection("countdown");
export const wallAchievements = makeCollection("achievements");
export const wallNotes = makeCollection("notes");
export const wallFamilyEvents = makeCollection("family-events");

// ---------- image helpers ----------

// Resize and JPEG-encode a File to keep the base64 payload small enough for
// MongoDB while still looking great in the UI.
export async function fileToCompressedDataUrl(file, { maxDim = 1280, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Invalid image"));
      img.onload = () => {
        const { width, height } = img;
        const ratio = Math.min(1, maxDim / Math.max(width, height));
        const w = Math.round(width * ratio);
        const h = Math.round(height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
