// Site Content API client.
//
// `getSiteContent()` is public (no token) → used by the legal pages so
// anonymous visitors render with the latest admin-edited copy.
// `updateSiteContent(patch)` is admin-only → used by the Admin Content
// Management page.
//
// Browser cache: legal pages can re-fetch on every mount because the
// payload is small (< 5 KB) and the admin needs edits to be visible
// "without redeploy". No need for SWR.

import { api } from "@/lib/api";
import { getAccountToken } from "@/lib/auth";

const PATH = "/site-content";

/** Public — works without authentication. Returns the merged document
 *  (admin-saved fields + sane defaults for the rest). Never throws —
 *  on network failure returns null so the page can fall back gracefully. */
export async function getSiteContent() {
  try {
    const { data } = await api.get(PATH);
    return data;
  } catch (_) {
    return null;
  }
}

/** Admin-only. Partial PATCH — only sent fields are updated server-side. */
export async function updateSiteContent(patch) {
  const token = getAccountToken();
  const { data } = await api.put(PATH, patch, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}
