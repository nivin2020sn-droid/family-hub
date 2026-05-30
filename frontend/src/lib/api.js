import axios from "axios";
import { attachAuth } from "@/lib/authInterceptor";
import { familyCache } from "@/lib/familyCache";

// Prefer build-time env var; fall back to same origin (works when frontend
// and backend share a domain, or in dev). This prevents `undefined/api`
// urls when REACT_APP_BACKEND_URL is missing in production builds.
const ENV_URL = process.env.REACT_APP_BACKEND_URL;
const BACKEND_URL =
  ENV_URL && ENV_URL.trim()
    ? ENV_URL.trim().replace(/\/+$/, "")
    : (typeof window !== "undefined" ? window.location.origin : "");

export const API = `${BACKEND_URL}/api`;

export const api = attachAuth(axios.create({
  baseURL: API,
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
}));

// Also install the interceptor on the global axios module so that bare
// `axios.get(...)` calls (used by wallApi & locationApi) get the JWT too.
attachAuth(axios);

// ===== Family-scoped offline cache =====
// Note: every cache read/write goes through `familyCache` which prefixes the
// localStorage key with the current `family_id`. This guarantees that
// signing into a different family on the same browser can NEVER surface
// the previous family's data, even on a transient API failure.

// ===== Event Types =====
export const getEventTypes = async () => {
  try {
    const { data } = await api.get("/event-types");
    const arr = Array.isArray(data) ? data : [];
    familyCache.write("eventTypes", arr);
    return arr;
  } catch (e) {
    // Only fall back to cache when we're certain it belongs to THIS family
    // (familyCache.read already enforces that via the key prefix). If the
    // current session has no family yet, this returns null → empty list.
    return familyCache.read("eventTypes") || [];
  }
};
export const createEventType = async (payload) => {
  const { data } = await api.post("/event-types", payload);
  return data;
};
export const updateEventType = async (id, payload) => {
  const { data } = await api.put(`/event-types/${id}`, payload);
  return data;
};
export const deleteEventType = async (id) => {
  const { data } = await api.delete(`/event-types/${id}`);
  return data;
};

// ===== Events =====
const eventsCacheKey = (params) =>
  `events:${params.user_id || params.user_ids || "all"}:${params.year || ""}:${params.month || ""}`;

export const getEvents = async (params = {}) => {
  try {
    const { data } = await api.get("/events", { params });
    const arr = Array.isArray(data) ? data : [];
    familyCache.write(eventsCacheKey(params), arr);
    return arr;
  } catch (e) {
    return familyCache.read(eventsCacheKey(params)) || [];
  }
};
export const createEvent = async (payload) => {
  const { data } = await api.post("/events", payload);
  return data;
};
export const updateEvent = async (id, payload) => {
  const { data } = await api.put(`/events/${id}`, payload);
  return data;
};
export const deleteEvent = async (id) => {
  const { data } = await api.delete(`/events/${id}`);
  return data;
};
