import axios from "axios";

// Prefer build-time env var; fall back to same origin (works when frontend
// and backend share a domain, or in dev). This prevents `undefined/api`
// urls when REACT_APP_BACKEND_URL is missing in production builds.
const ENV_URL = process.env.REACT_APP_BACKEND_URL;
const BACKEND_URL =
  ENV_URL && ENV_URL.trim()
    ? ENV_URL.trim().replace(/\/+$/, "")
    : (typeof window !== "undefined" ? window.location.origin : "");

export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

// ===== Offline cache helpers (localStorage, safe) =====
const CACHE_KEYS = {
  events: "mfml_cache_events",
  eventTypes: "mfml_cache_event_types",
  users: "mfml_cache_users",
};

const readCache = (key) => {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const writeCache = (key, data) => {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
};

// ===== Users =====
export const getUsers = async () => {
  try {
    const { data } = await api.get("/users");
    writeCache(CACHE_KEYS.users, data);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return readCache(CACHE_KEYS.users) || [];
  }
};
export const updateUser = async (id, payload) => {
  const { data } = await api.put(`/users/${id}`, payload);
  return data;
};

// ===== Event Types =====
export const getEventTypes = async () => {
  try {
    const { data } = await api.get("/event-types");
    writeCache(CACHE_KEYS.eventTypes, data);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return readCache(CACHE_KEYS.eventTypes) || [];
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
export const getEvents = async (params = {}) => {
  const cacheKey = `${CACHE_KEYS.events}_${params.user_id || "all"}_${params.year || ""}_${params.month || ""}`;
  try {
    const { data } = await api.get("/events", { params });
    if (Array.isArray(data)) writeCache(cacheKey, data);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return readCache(cacheKey) || [];
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
