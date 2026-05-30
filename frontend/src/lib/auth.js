// Multi-tenant auth — replaces the old single shared Family Code.
//
// Two tokens are persisted per device:
//   * account_token  — proves which family owns this session (after email+password).
//   * member_token   — proves which member is currently in front of the device.
//
// We also keep `mfml_auth_ok` set to "true" while either token is present so
// the existing <RequireAuth/> guard keeps working without touching every page.

import axios from "axios";

const KEY_ACCOUNT_TOKEN = "mfml_account_token";
const KEY_MEMBER_TOKEN = "mfml_member_token";
const KEY_ACCOUNT = "mfml_account";
const KEY_FAMILY = "mfml_family";
const KEY_MEMBER = "mfml_member";

// Legacy keys kept for backward compatibility with the existing app shell.
const LEGACY_AUTH_OK = "mfml_auth_ok";
const LEGACY_FAMILY_CODE = "mfml_family_code";

const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");

const api = axios.create({ baseURL: BACKEND_URL, timeout: 15000 });

// ---------- read helpers ----------
function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeJson(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
function read(key) {
  try { return localStorage.getItem(key) || ""; } catch { return ""; }
}
function write(key, value) {
  try {
    if (!value) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

// ---------- public API ----------
export function getAccountToken() { return read(KEY_ACCOUNT_TOKEN); }
export function getMemberToken() { return read(KEY_MEMBER_TOKEN); }
export function getAccount() { return readJson(KEY_ACCOUNT); }
export function getFamily() { return readJson(KEY_FAMILY); }
export function getMember() { return readJson(KEY_MEMBER); }

export function isAuthenticated() {
  // Either the new tokens or the legacy flag count as "logged in" so existing
  // pages keep working during the transition.
  if (read(KEY_MEMBER_TOKEN)) return true;
  if (read(KEY_ACCOUNT_TOKEN)) return true;
  return read(LEGACY_AUTH_OK) === "true";
}

// Legacy export — the standalone GPS Android sender app still uses a shared
// family code, validated against FAMILY_CODE on the server. We keep returning
// whatever is in storage (empty string if nothing).
export function getFamilyCode() {
  return read(LEGACY_FAMILY_CODE);
}

export function hasSelectedMember() {
  return !!read(KEY_MEMBER_TOKEN);
}

export function isAdmin() {
  const acc = getAccount();
  return acc?.role === "admin";
}

export function logout() {
  [
    KEY_ACCOUNT_TOKEN,
    KEY_MEMBER_TOKEN,
    KEY_ACCOUNT,
    KEY_FAMILY,
    KEY_MEMBER,
    LEGACY_AUTH_OK,
    LEGACY_FAMILY_CODE,
  ].forEach((k) => {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  });
}

export function logoutMemberOnly() {
  // Keep the account session, drop the per-device member so the user can
  // pick a different family member without re-entering email+password.
  try {
    localStorage.removeItem(KEY_MEMBER_TOKEN);
    localStorage.removeItem(KEY_MEMBER);
  } catch { /* ignore */ }
}

// ---------- network calls ----------
export async function register(payload) {
  const { data } = await api.post("/api/auth/register", payload);
  write(KEY_ACCOUNT_TOKEN, data.access_token);
  writeJson(KEY_ACCOUNT, data.account);
  writeJson(KEY_FAMILY, data.family);
  write(LEGACY_AUTH_OK, "true");
  return data;
}

export async function login(email, password) {
  const { data } = await api.post("/api/auth/login", { email, password });
  write(KEY_ACCOUNT_TOKEN, data.access_token);
  writeJson(KEY_ACCOUNT, data.account);
  writeJson(KEY_FAMILY, data.family);
  write(LEGACY_AUTH_OK, "true");
  return data;
}

export async function fetchAccountSummary() {
  const token = getAccountToken();
  const { data } = await api.get("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (data.account) writeJson(KEY_ACCOUNT, data.account);
  if (data.family) writeJson(KEY_FAMILY, data.family);
  return data;
}

export async function listMembers() {
  const token = getMemberToken() || getAccountToken();
  if (!token) return [];
  const { data } = await api.get("/api/family/members", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(data) ? data : [];
}

export async function addMember(payload) {
  const token = getMemberToken() || getAccountToken();
  const { data } = await api.post("/api/family/members", payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

export async function updateMember(id, payload) {
  const token = getMemberToken() || getAccountToken();
  const { data } = await api.put(`/api/family/members/${id}`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

export async function deleteMember(id) {
  const token = getMemberToken() || getAccountToken();
  await api.delete(`/api/family/members/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return true;
}

export async function selectMember(memberId, pin) {
  const token = getAccountToken();
  const { data } = await api.post(
    "/api/auth/member/select",
    { member_id: memberId, pin },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  write(KEY_MEMBER_TOKEN, data.member_token);
  writeJson(KEY_MEMBER, data.member);
  return data;
}

export async function forgotPassword(email) {
  const { data } = await api.post("/api/auth/forgot", { email });
  return data;
}

export async function resetPassword(code, newPassword) {
  const { data } = await api.post("/api/auth/reset", {
    code,
    new_password: newPassword,
  });
  return data;
}

// ---------- admin ----------
export async function adminListFamilies() {
  const token = getAccountToken();
  const { data } = await api.get("/api/admin/families", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data.families || [];
}

export async function adminSetFamilyStatus(familyId, status) {
  const token = getAccountToken();
  await api.post(
    `/api/admin/families/${familyId}/status`,
    { status },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return true;
}

export async function adminIssueRecovery(familyId) {
  const token = getAccountToken();
  const { data } = await api.post(
    `/api/admin/families/${familyId}/recovery`,
    {},
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data;
}
