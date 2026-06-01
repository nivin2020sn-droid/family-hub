// Pending-publish queue / privacy toast.
//
// When the user creates a new family-item (Note, Goal, Shopping item,
// Family Event, Countdown, Routine), the backend already saved the row
// with `pending_publish_at = now + 7s` and `visibility = "family"`. The
// item exists immediately for the creator but is hidden from siblings
// for the grace period. To let the creator change privacy / publish
// early / undo, we surface a small toast at the bottom of the screen
// with three actions.
//
// The toast queue is module-scoped (singleton) so any call site can
// dispatch via the exported `queuePendingPublish` helper without
// threading a context through every component.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const PrivacyCtx = createContext({
  queue: [],
  enqueue: () => {},
  remove: () => {},
});

// Module-level dispatcher — set by the provider on mount. Components
// outside React can reach it via `queuePendingPublish(...)`.
let dispatcher = null;

/**
 * Helper used by every "create" call site:
 *   const item = await api.post('/api/wall/notes', payload);
 *   queuePendingPublish({ kind: 'wall_notes', item, label: payload.text });
 *
 * The toast manages its own countdown using `item.pending_publish_at`.
 * If the field is missing (legacy server) or already in the past, the
 * helper is a no-op — nothing to show.
 */
export function queuePendingPublish({ kind, item, label }) {
  if (!dispatcher || !item) return;
  if (!item.pending_publish_at) return;
  const now = Date.now();
  const deadline = Date.parse(item.pending_publish_at);
  if (!Number.isFinite(deadline) || deadline <= now) return;
  dispatcher({
    kind,
    id: item.id,
    label: label || item.text || item.label || item.title || item.name || "Item",
    deadline,
  });
}

export const PrivacyProvider = ({ children }) => {
  const [queue, setQueue] = useState([]);
  const enqueue = useCallback((entry) => {
    setQueue((q) => {
      // De-dup on (kind, id) so a double-create doesn't spam two toasts.
      const stripped = q.filter(
        (e) => !(e.kind === entry.kind && e.id === entry.id),
      );
      return [...stripped, entry];
    });
  }, []);
  const remove = useCallback((kind, id) => {
    setQueue((q) => q.filter((e) => !(e.kind === kind && e.id === id)));
  }, []);

  useEffect(() => {
    dispatcher = enqueue;
    return () => {
      if (dispatcher === enqueue) dispatcher = null;
    };
  }, [enqueue]);

  const value = useMemo(() => ({ queue, enqueue, remove }), [queue, enqueue, remove]);
  return <PrivacyCtx.Provider value={value}>{children}</PrivacyCtx.Provider>;
};

export function usePrivacyQueue() {
  return useContext(PrivacyCtx);
}

/**
 * Hook used by the toast to display a live countdown. Returns the
 * integer seconds remaining; emits 0 once the deadline passes so the
 * toast can auto-dismiss.
 */
export function useCountdown(deadline) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.ceil((deadline - Date.now()) / 1000)),
  );
  const lastRef = useRef(remaining);
  useEffect(() => {
    const id = setInterval(() => {
      const next = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (next !== lastRef.current) {
        lastRef.current = next;
        setRemaining(next);
      }
      if (next === 0) clearInterval(id);
    }, 200);
    return () => clearInterval(id);
  }, [deadline]);
  return remaining;
}
