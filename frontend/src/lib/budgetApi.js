// Family Budget API client.
// Thin axios wrapper — server is authoritative for all aggregation.

import axios from "axios";

const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");
const api = axios.create({ baseURL: BACKEND_URL, timeout: 15000 });

const CRUD = (path) => ({
  async list() {
    try {
      const r = await api.get(`/api/budget/${path}`);
      return Array.isArray(r.data) ? r.data : [];
    } catch {
      return [];
    }
  },
  async create(body) {
    const r = await api.post(`/api/budget/${path}`, body);
    return r.data;
  },
  async update(id, body) {
    const r = await api.put(`/api/budget/${path}/${id}`, body);
    return r.data;
  },
  async remove(id) {
    await api.delete(`/api/budget/${path}/${id}`);
    return true;
  },
});

export const budgetIncome = CRUD("income");
export const budgetExpenses = CRUD("expenses");
export const budgetBills = CRUD("bills");
export const budgetDebts = CRUD("debts");
export const budgetLoans = CRUD("loans");

export async function fetchBudgetSummary() {
  try {
    const r = await api.get("/api/budget/summary");
    return r.data;
  } catch {
    return null;
  }
}

export const INCOME_TYPES = ["primary", "extra", "external"];
export const EXPENSE_CATS = [
  "food",
  "clothes",
  "travel",
  "maintenance",
  "gifts",
  "toys",
  "health",
  "other",
];
export const BILL_TYPES = ["fixed_monthly", "periodic", "yearly"];

export function fmtMoney(value, locale = "en-US", currency = "EUR") {
  const n = Number(value) || 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `€${n.toFixed(0)}`;
  }
}
