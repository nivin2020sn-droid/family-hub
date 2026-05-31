// Lightweight Google Analytics 4 helper.
//
// Why a wrapper?
// - Centralises every call site to a single API (trackEvent / trackPageView)
//   so we can swap providers later without hunting through components.
// - Stays a no-op if `window.gtag` isn't loaded yet (script blocker, network
//   error, server-side render): never throws, never breaks the page.
// - Exposes a small `useRouteAnalytics()` hook + a one-time global delegate
//   for button / form / contact-request events. This keeps the call sites
//   declarative (mark elements with `data-ga-event`) instead of sprinkling
//   trackEvent() throughout every component.
//
// GA4 Measurement ID: G-QS0W3Z2484  (configured in public/index.html)

import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const MEASUREMENT_ID = "G-QS0W3Z2484";

// Opt-in debug mode — append `?ga_debug=1` to ANY URL to make every event
// arrive in GA4's DebugView in real time, and verbose-log to the console.
// Useful for verifying the integration without touching the build.
const DEBUG_MODE =
  typeof window !== "undefined" &&
  /\b(ga_debug=1|gtm_debug=1)\b/.test(window.location.search || "");

// Tag for every event so the user can filter "audit traffic" out of GA
// reports if they want, and so we can see in DebugView exactly which
// build a hit came from. Increment this on any analytics-only change.
const ANALYTICS_BUILD = "mlmt-2026.02.05";

if (DEBUG_MODE && typeof window !== "undefined" && typeof window.gtag === "function") {
  // Re-issue the config with debug_mode so DebugView lights up.
  try {
    window.gtag("config", MEASUREMENT_ID, {
      send_page_view: false,
      anonymize_ip: true,
      debug_mode: true,
      cookie_flags: "SameSite=None;Secure",
    });
    // eslint-disable-next-line no-console
    console.info("[GA4] Debug mode enabled — events will appear in DebugView.");
  } catch (_) { /* noop */ }
}

/** Safe wrapper around window.gtag. Silently no-ops if GA isn't loaded. */
export function trackEvent(eventName, params = {}) {
  if (typeof window === "undefined") return;
  const gtag = window.gtag;
  if (typeof gtag !== "function") return;
  const enriched = {
    ...params,
    analytics_build: ANALYTICS_BUILD,
    ...(DEBUG_MODE ? { debug_mode: true } : {}),
    // Beacon transport so the hit survives page unload during navigation;
    // GA4 falls back to fetch+keepalive automatically on older browsers.
    transport_type: "beacon",
  };
  try {
    gtag("event", eventName, enriched);
    if (DEBUG_MODE) {
      // eslint-disable-next-line no-console
      console.info("[GA4]", eventName, enriched);
    }
  } catch (_) {
    // Never let analytics crash the app.
  }
}

/** Fire a GA4 page_view. Called automatically on every SPA route change. */
export function trackPageView(path) {
  if (typeof window === "undefined") return;
  trackEvent("page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
    send_to: MEASUREMENT_ID,
  });
}

/**
 * Hook that sends a `page_view` event whenever React Router navigates.
 * Mount it ONCE inside the <BrowserRouter> tree (we do it at App root).
 *
 * We wait a microtask + a short delay so `document.title` has been updated
 * by `usePageMeta` and the route's own redirects have settled. This avoids
 * the classic SPA double-count where the initial `/` page_view fires
 * BEFORE a guard redirects to `/login`.
 */
export function useRouteAnalytics() {
  const location = useLocation();
  useEffect(() => {
    const path = location.pathname + location.search;
    // 60ms: long enough for redirect-on-mount components (RequireAuth,
    // <Navigate />) to push a new history entry — short enough to feel
    // instant for analytics purposes.
    const t = setTimeout(() => {
      // If the location changed AGAIN within those 60ms (redirect chain),
      // skip this one; the next effect run will catch the final URL.
      if (
        window.location.pathname + window.location.search ===
        path
      ) {
        trackPageView(path);
      }
    }, 60);
    return () => clearTimeout(t);
  }, [location.pathname, location.search]);
}

// ---------- Global delegated listeners (init once at app start) ----------
// We attach a single delegated click + submit handler on document so we
// don't have to wire every button. Elements opt in either implicitly
// (any <button> / <a> click is captured as button_click) or explicitly
// (via `data-ga-event="<name>"` + optional `data-ga-<key>="<value>"`).
let _delegatesInitialised = false;
export function initGlobalEventDelegation() {
  if (_delegatesInitialised || typeof document === "undefined") return;
  _delegatesInitialised = true;

  const collectDatasetParams = (el) => {
    const out = {};
    for (const [k, v] of Object.entries(el.dataset || {})) {
      if (!k.startsWith("ga") || k === "gaEvent") continue;
      // dataset.gaFooBar → "foo_bar"
      const key = k
        .slice(2)
        .replace(/([A-Z])/g, "_$1")
        .toLowerCase()
        .replace(/^_/, "");
      out[key] = v;
    }
    return out;
  };

  const labelFor = (el) =>
    (
      el.dataset.gaLabel ||
      el.getAttribute("aria-label") ||
      el.getAttribute("data-testid") ||
      el.textContent ||
      ""
    )
      .trim()
      .slice(0, 80);

  document.addEventListener(
    "click",
    (e) => {
      const path = e.composedPath ? e.composedPath() : [];
      // Walk up looking for the first relevant target.
      const target = path.find(
        (n) =>
          n &&
          n.nodeType === 1 &&
          (n.matches?.("[data-ga-event]") ||
            n.tagName === "BUTTON" ||
            (n.tagName === "A" && n.href)),
      );
      if (!target) return;

      const custom = target.getAttribute?.("data-ga-event");
      if (custom) {
        // Explicit event — full control of name + params.
        trackEvent(custom, {
          label: labelFor(target),
          ...collectDatasetParams(target),
        });
        return;
      }

      // Implicit: contact_request for mailto links, button_click otherwise.
      if (target.tagName === "A") {
        const href = target.getAttribute("href") || "";
        if (href.startsWith("mailto:")) {
          trackEvent("contact_request", {
            method: "email",
            email: href.replace(/^mailto:/, "").split("?")[0],
            label: labelFor(target),
          });
          return;
        }
        // Outbound links → click event with destination.
        if (/^https?:/.test(href) && !href.includes(window.location.host)) {
          trackEvent("outbound_click", {
            link_url: href,
            label: labelFor(target),
          });
          return;
        }
        // Internal anchor — let the SPA route listener fire its page_view.
        return;
      }

      // Plain <button>.
      trackEvent("button_click", { label: labelFor(target) });
    },
    { capture: true, passive: true },
  );

  document.addEventListener(
    "submit",
    (e) => {
      const form = e.target;
      if (!form || form.tagName !== "FORM") return;
      const name =
        form.getAttribute("data-ga-form") ||
        form.getAttribute("name") ||
        form.getAttribute("data-testid") ||
        "unnamed_form";
      trackEvent("form_submit", {
        form_name: name.trim().slice(0, 80),
        ...collectDatasetParams(form),
      });
    },
    { capture: true, passive: true },
  );
}
