// Family Budget API client.
// Thin axios wrapper — server is authoritative for all aggregation.

import axios from "axios";
import { attachAuth } from "./authInterceptor";

const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");
const api = attachAuth(axios.create({ baseURL: BACKEND_URL, timeout: 15000 }));

const CRUD = (path) => ({
  async list(params) {
    try {
      const r = await api.get(`/api/budget/${path}`, params ? { params } : undefined);
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
  async remove(id, params) {
    await api.delete(`/api/budget/${path}/${id}`, params ? { params } : undefined);
    return true;
  },
});

export const budgetIncome = CRUD("income");
export const budgetExpenses = CRUD("expenses");
export const budgetBills = CRUD("bills");
export const budgetDebts = CRUD("debts");
export const budgetLoans = CRUD("loans");

export async function fetchBudgetSummary(params) {
  try {
    const r = await api.get("/api/budget/summary", params ? { params } : undefined);
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

// Owner identity is now dynamic: every family member is a wallet owner,
// plus the literal "shared" sentinel for joint household items.
export const SHARED_OWNER = "shared";

// Default shared-wallet theme (green). Per-member colors come from
// `family_members[].color` which is auto-assigned from a 12-color palette
// in the backend. Lightening / darkening helpers convert that single hex
// into the (ring/soft/fg/text) palette the wallet card consumes.
const SHARED_COLOR = "#10B981";

function hexToRgb(hex) {
  const m = (hex || "").replace("#", "").match(/[0-9a-f]{2}/gi);
  if (!m || m.length !== 3) return [0, 0, 0];
  return m.map((x) => parseInt(x, 16));
}
function rgbToHex(r, g, b) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
function mix(hex, towards, amount) {
  // amount in [0, 1] → 0 keeps hex, 1 returns towards.
  const [r1, g1, b1] = hexToRgb(hex);
  const [r2, g2, b2] = hexToRgb(towards);
  return rgbToHex(
    r1 + (r2 - r1) * amount,
    g1 + (g2 - g1) * amount,
    b1 + (b2 - b1) * amount,
  );
}

/** Build a wallet color palette from a single member hex color. */
export function paletteFromHex(hex) {
  const ring = hex || "#3B82F6";
  return {
    ring,
    soft: mix(ring, "#FFFFFF", 0.85), // very light pastel background
    fg: mix(ring, "#000000", 0.2),    // mid-tone label color
    text: mix(ring, "#000000", 0.5),  // strong title color
  };
}

/** Resolve the {id → palette} map from a wallet_owners list (from /api/budget/summary). */
export function buildOwnerColorMap(walletOwners = []) {
  const map = { [SHARED_OWNER]: paletteFromHex(SHARED_COLOR) };
  for (const m of walletOwners) {
    if (m && m.id) map[m.id] = paletteFromHex(m.color || "#3B82F6");
  }
  return map;
}

/** Resolve a stable display name for any owner string. */
export function ownerLabel(ownerId, walletOwners, sharedLabel) {
  if (!ownerId || ownerId === SHARED_OWNER) return sharedLabel || "Shared";
  const m = (walletOwners || []).find((x) => x.id === ownerId);
  return m?.name || sharedLabel || ownerId;
}

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
