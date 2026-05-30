// "Recent activity by you" feed — small wrapper around /api/activity/recent.
import axios from "axios";

const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");

const baseURL = `${BACKEND_URL}/api/activity`;

export async function fetchRecentActivity({ limit = 3, scope = "self" } = {}) {
  const { data } = await axios.get(`${baseURL}/recent`, {
    params: { limit, scope },
  });
  return data?.items || [];
}
