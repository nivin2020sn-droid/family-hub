// REST client for the Routines feature.
// Network-only (no offline queue) to keep the engine simple — the cards are
// useful only when the server is reachable for next-due computation.

import axios from "axios";
import { attachAuth } from "./authInterceptor";

const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");

const api = attachAuth(axios.create({ baseURL: BACKEND_URL, timeout: 15000 }));

export async function listRoutines() {
  try {
    const res = await api.get("/api/routines");
    return Array.isArray(res.data) ? res.data : [];
  } catch {
    return [];
  }
}

export async function createRoutine(payload) {
  const res = await api.post("/api/routines", payload);
  if (res.data && res.data.pending_publish_at) {
    import("./privacyQueue").then(({ queuePendingPublish }) => {
      queuePendingPublish({
        kind: "routines",
        item: res.data,
        label: res.data.title,
      });
    });
  }
  return res.data;
}

export async function updateRoutine(id, payload) {
  const res = await api.put(`/api/routines/${id}`, payload);
  return res.data;
}

export async function deleteRoutine(id) {
  await api.delete(`/api/routines/${id}`);
  return true;
}

export async function completeRoutine(id, body = {}) {
  const res = await api.post(`/api/routines/${id}/complete`, body);
  return res.data;
}

export async function snoozeRoutine(id, minutes = 60) {
  const res = await api.post(`/api/routines/${id}/snooze`, { minutes });
  return res.data;
}

export async function listRoutineLogs(id) {
  try {
    const res = await api.get(`/api/routines/${id}/logs`);
    return Array.isArray(res.data) ? res.data : [];
  } catch {
    return [];
  }
}

export async function deleteRoutineLog(routineId, logId) {
  await api.delete(`/api/routines/${routineId}/logs/${logId}`);
  return true;
}

// ---------- countdown / status helpers ----------

// Total period for a routine in ms — used to compute when the card should
// transition from green → orange. For monthly_weekday we approximate to 30d.
export function periodMs(routine) {
  const i = Math.max(1, Number(routine.recurrence_interval) || 1);
  switch (routine.recurrence_type) {
    case "minutes":
      return i * 60_000;
    case "hours":
      return i * 3_600_000;
    case "days":
      return i * 86_400_000;
    case "weeks":
      return i * 604_800_000;
    case "months":
      return i * 30 * 86_400_000;
    case "monthly_weekday":
      return 30 * 86_400_000;
    default:
      return 86_400_000;
  }
}

// Returns "red" | "orange" | "green" based on the time remaining until
// `next_due_at`. Orange when within max(notify_before_minutes, 15% period).
export function statusFor(routine, now = Date.now()) {
  const due = new Date(routine.next_due_at).getTime();
  if (!Number.isFinite(due)) return "green";
  const diff = due - now;
  if (diff <= 0) return "red";
  const notifyBefore = (Number(routine.notify_before_minutes) || 0) * 60_000;
  const threshold = Math.max(notifyBefore, periodMs(routine) * 0.15);
  if (diff <= threshold) return "orange";
  return "green";
}

// Returns { days, hours, minutes, seconds, overdue, totalMs } for live UI.
export function timeRemaining(routine, now = Date.now()) {
  const due = new Date(routine.next_due_at).getTime();
  const diff = due - now;
  const abs = Math.abs(diff);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);
  const seconds = Math.floor((abs % 60_000) / 1000);
  return { days, hours, minutes, seconds, overdue: diff < 0, totalMs: diff };
}
