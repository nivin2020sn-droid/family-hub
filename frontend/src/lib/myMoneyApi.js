// Kids' Money ("My Money") API helpers.
// All requests go through the global axios instance that auto-attaches the
// member JWT via `authInterceptor.js`, so we never set the header by hand.

import axios from "axios";

const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");

const baseURL = `${BACKEND_URL}/api/kids-money`;

// `memberId` is OPTIONAL: when absent the backend serves the caller's own
// ledger (children) or refuses (admins must pick a kid). When present, only
// family admins can target a different member.
export async function fetchSummary(memberId) {
  const params = memberId ? { member_id: memberId } : {};
  const { data } = await axios.get(`${baseURL}/summary`, { params });
  return data;
}

export async function fetchTransactions(memberId) {
  const params = memberId ? { member_id: memberId } : {};
  const { data } = await axios.get(`${baseURL}/transactions`, { params });
  return Array.isArray(data) ? data : [];
}

export async function createTransaction(payload) {
  const { data } = await axios.post(`${baseURL}/transactions`, payload);
  return data;
}

export async function updateTransaction(id, payload) {
  const { data } = await axios.put(`${baseURL}/transactions/${id}`, payload);
  return data;
}

export async function deleteTransaction(id) {
  await axios.delete(`${baseURL}/transactions/${id}`);
  return true;
}

// Admin-only: list every child in the family with their current balance.
export async function fetchAllKids() {
  const { data } = await axios.get(`${baseURL}/kids`);
  return data?.kids || [];
}
