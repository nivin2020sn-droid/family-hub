import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  headers: { "Content-Type": "application/json" },
});

// ===== Offline cache helpers (localStorage) =====
const CACHE_KEYS = {
  events: "mfml_cache_events",
  eventTypes: "mfml_cache_event_types",
  users: "mfml_cache_users",
};

const readCache = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const writeCache = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
};

// ===== Users =====
export const getUsers = async () => {
  try {
    const { data } = await api.get("/users");
    writeCache(CACHE_KEYS.users, data);
    return data;
  } catch (e) {
    return readCache(CACHE_KEYS.users) || [];
  }
};

// ===== Event Types =====
export const getEventTypes = async () => {
  try {
    const { data } = await api.get("/event-types");
    writeCache(CACHE_KEYS.eventTypes, data);
    return data;
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
  try {
    const { data } = await api.get("/events", { params });
    // cache by month-year-user
    const key = `${CACHE_KEYS.events}_${params.user_id || "all"}_${params.year || ""}_${params.month || ""}`;
    writeCache(key, data);
    return data;
  } catch (e) {
    const key = `${CACHE_KEYS.events}_${params.user_id || "all"}_${params.year || ""}_${params.month || ""}`;
    return readCache(key) || [];
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
