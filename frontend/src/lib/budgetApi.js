// Family Budget API client.
// Thin axios wrapper — server is authoritative for all aggregation.

import axios from "axios";
import { attachAuth } from "./authInterceptor";

const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");
const api = attachAuth(axios.create({ baseURL: BACKEND_URL, timeout: 15000 }));

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

export async function fetchBudgetForecast(year, month) {
  const r = await api.get(`/api/budget/forecast?year=${year}&month=${month}`);
  return r.data;
}

export async function fetchBudgetForecastRange(months = 6) {
  const r = await api.get(`/api/budget/forecast/range?months=${months}`);
  return r.data;
}

export async function fetchExpiringContracts() {
  try {
    const r = await api.get("/api/budget/contracts/expiring");
    return r.data?.expiring || [];
  } catch {
    return [];
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
export const OWNERS = ["bahaa", "theresa", "shared"];

// Wallet color palette — mirrors the Time Plan profile colors.
export const OWNER_COLORS = {
  bahaa: { ring: "#3B82F6", soft: "#DBEAFE", fg: "#1D4ED8", text: "#1E3A8A" },
  theresa: { ring: "#EC4899", soft: "#FCE7F3", fg: "#BE185D", text: "#831843" },
  shared: { ring: "#10B981", soft: "#D1FAE5", fg: "#047857", text: "#065F46" },
};

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
