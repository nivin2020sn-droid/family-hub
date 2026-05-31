// Multi-tenant auth — replaces the old single shared Family Code.
//
// Two tokens are persisted per device:
//   * account_token  — proves which family owns this session (after email+password).
//   * member_token   — proves which member is currently in front of the device.
//
// We also keep `mfml_auth_ok` set to "true" while either token is present so
// the existing <RequireAuth/> guard keeps working without touching every page.

import axios from "axios";
import { attachAuth } from "./authInterceptor";
import { purgeAllFamilyCaches } from "./familyCache";

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

const api = attachAuth(axios.create({ baseURL: BACKEND_URL, timeout: 15000 }));

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

/** True when the current session belongs to a single-user (no-family) account.
 *  Single accounts hide all family-management surfaces and auto-skip the
 *  "Who are you?" PIN gate (the backend issues both tokens at login time). */
export function isSingleAccount() {
  return getFamily()?.account_type === "single";
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
  // CRITICAL: wipe every family-scoped cache so the next sign-in (potentially
  // a DIFFERENT family on the same browser) starts with a clean slate.
  // Without this, stale event_types / wall_notes / locations from family A
  // would leak into family B's UI on the first paint.
  purgeAllFamilyCaches();
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
  // Defensive: registration always starts a brand-new tenant context, so
  // wipe any leftover family-scoped caches BEFORE we write the new tokens
  // (otherwise the new family would inherit the previous browser's cache).
  purgeAllFamilyCaches();
  const { data } = await api.post("/api/auth/register", payload);
  // The current flow returns NO tokens — the user must verify their email
  // before signing in. We just hand the response back so the page can show
  // a "Check your inbox" screen.
  return data;
}

export async function verifyEmail(token) {
  const { data } = await api.post("/api/auth/verify-email", { token });
  return data;
}

export async function resendVerification(email, lang) {
  const { data } = await api.post("/api/auth/resend-verification", { email, lang });
  return data;
}

export async function forgotPasswordEmail(email, lang) {
  const { data } = await api.post("/api/auth/forgot-password", { email, lang });
  return data;
}

export async function resetPasswordWithToken(token, newPassword) {
  const { data } = await api.post("/api/auth/reset-password", {
    token,
    new_password: newPassword,
  });
  return data;
}

export async function login(email, password) {
  // Same defensive wipe as register — protect against switching families.
  purgeAllFamilyCaches();
  const { data } = await api.post("/api/auth/login", { email, password });
  write(KEY_ACCOUNT_TOKEN, data.access_token);
  writeJson(KEY_ACCOUNT, data.account);
  writeJson(KEY_FAMILY, data.family);
  write(LEGACY_AUTH_OK, "true");
  if (data.member_token) {
    write(KEY_MEMBER_TOKEN, data.member_token);
    writeJson(KEY_MEMBER, data.member);
  }
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
  // If the caller just edited their OWN identity (name / avatar / colour /
  // admin flag), refresh the cached member doc so every header re-renders
  // with the new avatar instantly — no need to log out and back in.
  try {
    const cached = readJson(KEY_MEMBER);
    if (cached && cached.id === id) {
      writeJson(KEY_MEMBER, { ...cached, ...data });
    }
  } catch {}
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

/** Convert a single-user account into a real family account so the user can
 *  invite more members. The auto-created "Me" member is preserved. */
export async function upgradeToFamily(familyName) {
  const token = getAccountToken();
  const { data } = await api.post(
    "/api/auth/upgrade-to-family",
    { family_name: familyName },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (data.family) writeJson(KEY_FAMILY, data.family);
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

export async function adminSetFamilyAccount(familyId, payload) {
  const token = getAccountToken();
  const { data } = await api.post(
    `/api/admin/families/${familyId}/account`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data;
}

export async function adminAddFamilyMember(familyId, payload) {
  const token = getAccountToken();
  const { data } = await api.post(
    `/api/admin/families/${familyId}/members`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data;
}

export async function adminFamilyDiagnostic(familyId) {
  const token = getAccountToken();
  const { data } = await api.get(
    `/api/admin/families/${familyId}/diagnostic`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data;
}

export async function adminDeleteFamily(familyId) {
  const token = getAccountToken();
  await api.delete(
    `/api/admin/families/${familyId}?confirm=${encodeURIComponent(familyId)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return true;
}

// ---------- Admin email (SMTP) settings ----------

export async function adminGetEmailSettings() {
  const token = getAccountToken();
  const { data } = await api.get("/api/admin/email-settings", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

export async function adminUpdateEmailSettings(patch) {
  const token = getAccountToken();
  const { data } = await api.put("/api/admin/email-settings", patch, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

export async function adminTestEmail(to, lang) {
  const token = getAccountToken();
  // SMTP timeout on the backend is 10s — give axios 30s headroom so a
  // slow handshake still resolves with the backend's structured error
  // instead of a generic client-side timeout.
  const { data } = await api.post(
    "/api/admin/email-settings/test",
    { to, lang },
    {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 30000,
    }
  );
  return data;
}

// ---------- GDPR account deletion (soft-delete, 30-day grace window) ----------

/** Request permanent account deletion. Server sets status="deletion_requested"
 *  and schedules the hard-purge for +30 days. The caller must supply the
 *  account password and one of the localized confirmation phrases (DELETE /
 *  حذف / LÖSCHEN). */
export async function requestAccountDeletion(password, confirm) {
  const token = getAccountToken();
  const { data } = await api.post(
    "/api/account/request-delete",
    { password, confirm },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data;
}

/** Revoke a pending deletion. Re-enables login and clears the schedule. */
export async function cancelAccountDeletion() {
  const token = getAccountToken();
  const { data } = await api.post(
    "/api/account/cancel-delete",
    {},
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data;
}

/** Read the current account's deletion status — used to drive the cancel
 *  banner / pending-deletion page after login. */
export async function fetchDeletionStatus() {
  const token = getAccountToken();
  const { data } = await api.get("/api/account/deletion-status", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}
