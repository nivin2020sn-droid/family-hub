// Simple Family Code gate.
//
// Once the user unlocks with the correct code, we persist a flag in
// localStorage. We never re-verify against the server after that — the app
// is meant to be fully usable offline (PWA), so we trust the device.
// The flag is cleared only when the user explicitly logs out.

import axios from "axios";

const AUTH_KEY = "mfml_auth_ok";
const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL || window.location.origin;

export function isAuthenticated() {
  try {
    return localStorage.getItem(AUTH_KEY) === "true";
  } catch {
    return false;
  }
}

export async function login(code) {
  const trimmed = (code || "").trim();
  if (!trimmed) {
    throw new Error("Please enter the family code");
  }
  try {
    const res = await axios.post(
      `${BACKEND_URL}/api/auth/verify`,
      { code: trimmed },
      { timeout: 10000 }
    );
    if (res.data && res.data.ok) {
      localStorage.setItem(AUTH_KEY, "true");
      return true;
    }
    throw new Error("Invalid family code");
  } catch (err) {
    if (err.response && err.response.status === 401) {
      throw new Error("Invalid family code");
    }
    // Network / server-sleep: surface a clear message — do NOT silently log in.
    throw new Error(
      "Cannot reach the server. Check your internet and try again."
    );
  }
}

export function logout() {
  try {
    localStorage.removeItem(AUTH_KEY);
  } catch {
    /* ignore */
  }
}
