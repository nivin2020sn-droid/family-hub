// Attaches `Authorization: Bearer <token>` to every axios request that targets
// our backend, so the per-family JWT context arrives at the FastAPI tenant
// middleware on EVERY data call (Budget, Routines, Wall Board, Shopping,
// Locations, etc.). Without this, the middleware sees no token, the
// ScopedCollection raises "Family context required" (401), and the UI falls
// back to empty state — which is exactly what the user reported.

const KEY_ACCOUNT = "mfml_account_token";
const KEY_MEMBER = "mfml_member_token";

function pickToken() {
  try {
    return (
      localStorage.getItem(KEY_MEMBER) ||
      localStorage.getItem(KEY_ACCOUNT) ||
      ""
    );
  } catch {
    return "";
  }
}

// Skip injecting on auth endpoints — those define their own headers, and the
// register/login calls must not carry stale tokens.
const SKIP_PATHS = ["/api/auth/login", "/api/auth/register", "/api/auth/forgot", "/api/auth/reset"];

function shouldSkip(url) {
  if (!url) return false;
  return SKIP_PATHS.some((p) => url.includes(p));
}

export function attachAuth(instance) {
  // Defensive: also catch instances that were already given the interceptor
  // (during hot reload).
  if (instance.__mfml_auth_attached__) return instance;
  instance.__mfml_auth_attached__ = true;

  instance.interceptors.request.use((config) => {
    // Never override a header that the caller explicitly set.
    const hasAuth =
      config.headers?.Authorization ||
      config.headers?.authorization ||
      config.headers?.common?.Authorization;
    if (hasAuth) return config;
    if (shouldSkip(config.url || "")) return config;

    const token = pickToken();
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });
  return instance;
}
