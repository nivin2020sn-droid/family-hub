// Lightweight info-only snackbar.
//
// Per user spec: "إشعار العدّاد ليس أداة تحكم أساسية. العدّاد فقط رسالة
// معلومات للمستخدم: 'تم حفظ العنصر. سيصبح مرئياً للعائلة خلال 10 ثوانٍ.'"
//
// The toast just reassures the creator that the item hasn't gone public
// yet. Real privacy control lives on each item row (see PrivacyControl).
// We keep a tiny "Undo" button as a quick action — it deletes the item
// outright if the user changed their mind before publish.

import { useEffect, useState } from "react";
import { Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useCountdown, usePrivacyQueue } from "@/lib/privacyQueue";
import { api } from "@/lib/api";

// Total grace window — must match `DEFAULT_GRACE_SECONDS` in
// /app/backend/privacy.py.
const GRACE_SECONDS = 10;

export default function PrivacyPublishToast() {
  const { queue, remove } = usePrivacyQueue();
  const entry = queue[0];
  if (!entry) return null;
  return <ToastBody key={`${entry.kind}-${entry.id}`} entry={entry} remove={remove} />;
}

function ToastBody({ entry, remove }) {
  const { t } = useI18n();
  const remaining = useCountdown(entry.deadline);
  const [busy, setBusy] = useState(false);

  // Auto-dismiss when the deadline passes — the server has already
  // published the row, the toast just leaves the queue silently.
  useEffect(() => {
    if (remaining <= 0) {
      const id = setTimeout(() => remove(entry.kind, entry.id), 250);
      return () => clearTimeout(id);
    }
  }, [remaining, entry.kind, entry.id, remove]);

  const close = () => remove(entry.kind, entry.id);

  const onUndo = async () => {
    setBusy(true);
    try {
      const path = DELETE_PATHS[entry.kind];
      if (path) await api.delete(`${path}/${entry.id}`);
      toast.success(t("privacy.toast.undone"));
    } catch {
      toast.error(t("privacy.toast.error"));
    } finally {
      setBusy(false);
      close();
    }
  };

  // Countdown ring math
  const pct = Math.max(0, Math.min(1, remaining / GRACE_SECONDS));
  const dash = 2 * Math.PI * 14;
  const offset = dash * (1 - pct);

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[80] w-[calc(100%-32px)] max-w-md"
      data-testid={`privacy-toast-${entry.kind}-${entry.id}`}
    >
      <div className="rounded-2xl bg-[#1F1B17] text-white shadow-2xl border border-white/10 px-4 py-3 flex items-center gap-3">
        {/* Countdown ring */}
        <div className="relative w-10 h-10 shrink-0">
          <svg viewBox="0 0 32 32" className="w-10 h-10 -rotate-90">
            <circle cx="16" cy="16" r="14" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
            <circle
              cx="16" cy="16" r="14" fill="none"
              stroke="#A7F3D0" strokeWidth="3" strokeLinecap="round"
              strokeDasharray={dash} strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 200ms linear" }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold">
            {remaining}
          </span>
        </div>
        {/* Info text — purely informational, no controls. */}
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold leading-tight">
            {t("privacy.toast.savedTitle")}
          </div>
          <div className="text-[10px] opacity-70 leading-tight mt-0.5">
            {t("privacy.toast.savedSubtitle", { seconds: remaining })}
          </div>
        </div>
        {/* Quick action — Undo only. Privacy mode is controlled on the
            item itself; auto-publish ticks away in the background. */}
        <button
          type="button"
          onClick={onUndo}
          disabled={busy}
          title={t("privacy.toast.undo")}
          aria-label={t("privacy.toast.undo")}
          className="h-8 px-3 rounded-full inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider bg-white/8 hover:bg-white/15 disabled:opacity-40 transition-colors"
          data-testid="privacy-toast-undo"
        >
          <Undo2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t("privacy.toast.undo")}</span>
        </button>
        <button
          type="button"
          onClick={close}
          className="p-1 rounded-full hover:bg-white/10 opacity-50 hover:opacity-100"
          aria-label={t("btn.close")}
          data-testid="privacy-toast-close"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// Same path map the toast uses for its Undo button. Kept here (not in
// privacyApi) because this is presentation glue, not API surface.
const DELETE_PATHS = {
  wall_notes: "/wall/notes",
  wall_goals: "/wall/goals",
  wall_countdown: "/wall/countdown",
  wall_family_events: "/wall/family-events",
  shopping_items: "/shopping",
  routines: "/routines",
};
