// REST client for the simple family Shopping List.
// Network-only — items are tiny and the feature is meant for quick on-the-spot
// edits while shopping. Keeping the API thin avoids needless complexity.

import axios from "axios";

const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");

const api = axios.create({ baseURL: BACKEND_URL, timeout: 15000 });

export async function listShoppingItems() {
  try {
    const res = await api.get("/api/shopping");
    return Array.isArray(res.data) ? res.data : [];
  } catch {
    return [];
  }
}

export async function createShoppingItem(name) {
  const res = await api.post("/api/shopping", { name });
  return res.data;
}

export async function toggleShoppingItem(id) {
  const res = await api.patch(`/api/shopping/${id}/toggle`);
  return res.data;
}

export async function deleteShoppingItem(id) {
  await api.delete(`/api/shopping/${id}`);
  return true;
}

export async function finishShopping() {
  const res = await api.post("/api/shopping/finish");
  return res.data;
}
