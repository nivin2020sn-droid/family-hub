// Embedded "My Routines" section for Wall Board.
//
// Renders the routines list directly inline (no link / no navigation). Shows
// the first 5 cards sorted overdue → approaching → on-track, with a "View More"
// toggle to reveal the rest. Add / edit / complete / snooze / history all
// happen inside this card via dialogs — the user never leaves Wall Board.

import { useEffect, useMemo, useRef, useState } from "react";
import { Repeat, Plus, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import {
  listRoutines,
  createRoutine,
  updateRoutine,
  deleteRoutine,
  completeRoutine,
  snoozeRoutine,
  statusFor,
} from "@/lib/routinesApi";
import {
  RoutineCard,
  RoutineEditor,
  RoutineHistoryDialog,
  CompleteDialog,
} from "@/pages/Routines";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

const PREVIEW_COUNT = 5;

// Status weight for sort: overdue first, then approaching, then on-track.
const SORT_WEIGHT = { red: 0, orange: 1, green: 2 };

const WallBoardRoutines = () => {
  const { t } = useI18n();
  const [routines, setRoutines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [expanded, setExpanded] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorInitial, setEditorInitial] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRoutine, setHistoryRoutine] = useState(null);
  const [snoozeTarget, setSnoozeTarget] = useState(null);
  const [completeTarget, setCompleteTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const notifiedRef = useRef({});

  // Live clock for countdowns
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await listRoutines();
      setRoutines(data);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
  }, []);

  // Browser notifications when an item crosses into its notify window.
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    routines.forEach((r) => {
      if (!r.notify_enabled) return;
      const due = new Date(r.next_due_at).getTime();
      const threshold = (Number(r.notify_before_minutes) || 0) * 60_000;
      const triggerAt = due - threshold;
      if (now >= triggerAt && now < due + 60_000) {
        if (notifiedRef.current[r.id] === r.next_due_at) return;
        notifiedRef.current[r.id] = r.next_due_at;
        try {
          new Notification(r.title, {
            body: t("routines.notifyBody", { title: r.title }),
            icon: "/logo192.png",
            tag: `routine-${r.id}`,
          });
        } catch {
          /* ignore */
        }
      }
    });
  }, [now, routines, t]);

  // Sorted list — overdue first, then approaching, then on-track. Within each
  // bucket, sort by nearest next_due_at.
  const sorted = useMemo(() => {
    return [...routines].sort((a, b) => {
      const sa = SORT_WEIGHT[statusFor(a, now)] ?? 9;
      const sb = SORT_WEIGHT[statusFor(b, now)] ?? 9;
      if (sa !== sb) return sa - sb;
      return new Date(a.next_due_at).getTime() - new Date(b.next_due_at).getTime();
    });
  }, [routines, now]);

  // Status counts for the summary line
  const counts = useMemo(() => {
    let overdue = 0;
    let approaching = 0;
    let active = routines.length;
    routines.forEach((r) => {
      const s = statusFor(r, now);
      if (s === "red") overdue += 1;
      else if (s === "orange") approaching += 1;
    });
    return { active, approaching, overdue };
  }, [routines, now]);

  const visible = expanded ? sorted : sorted.slice(0, PREVIEW_COUNT);
  const hasMore = sorted.length > PREVIEW_COUNT;

  // ---- handlers ----
  const handleSave = async (payload) => {
    if (editorInitial) {
      await updateRoutine(editorInitial.id, payload);
    } else {
      await createRoutine(payload);
      // First create — opportunistically ask for notification permission.
      if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "default"
      ) {
        try {
          await Notification.requestPermission();
        } catch {
          /* ignore */
        }
      }
    }
    setEditorInitial(null);
    await refresh();
  };

  const handleComplete = async (body) => {
    if (!completeTarget) return;
    try {
      await completeRoutine(completeTarget.id, body);
      notifiedRef.current[completeTarget.id] = null;
      toast.success(t("routines.completeToast"));
      await refresh();
    } catch {
      toast.error(t("routines.saveError"));
    }
  };

  const handleSnooze = async (minutes) => {
    if (!snoozeTarget) return;
    try {
      await snoozeRoutine(snoozeTarget.id, minutes);
      toast.success(t("routines.snoozeToast"));
      setSnoozeTarget(null);
      await refresh();
    } catch {
      toast.error(t("routines.saveError"));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteRoutine(deleteTarget.id);
      toast.success(t("routines.deletedToast"));
      setDeleteTarget(null);
      await refresh();
    } catch {
      toast.error(t("routines.saveError"));
    }
  };

  // ---- render ----
  return (
    <div
      className="rounded-3xl border border-black/[0.04] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.08)] overflow-hidden bg-white"
      data-testid="card-routines"
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 sm:px-5 pt-4 sm:pt-5 pb-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white shadow-sm flex-shrink-0"
          style={{ backgroundColor: "#7C3AED" }}
        >
          <Repeat className="w-4 h-4" strokeWidth={2} />
        </div>
        <h3 className="font-heading text-base sm:text-lg font-semibold text-[#2D2A26] tracking-tight flex-1">
          {t("routines.title")}
        </h3>
        <button
          type="button"
          onClick={() => {
            setEditorInitial(null);
            setEditorOpen(true);
          }}
          className="w-8 h-8 rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white flex items-center justify-center active:scale-95 transition shadow-sm"
          aria-label={t("routines.add")}
          data-testid="routines-add-btn-inline"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
        </button>
      </div>

      {/* Summary line */}
      <div className="px-4 sm:px-5 -mt-1 pb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span className="inline-flex items-center gap-1.5 text-[#2D2A26] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          {t("routines.section.active", { n: counts.active })}
        </span>
        <span className="inline-flex items-center gap-1.5 text-amber-700 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          {t("routines.section.approaching", { n: counts.approaching })}
        </span>
        <span className="inline-flex items-center gap-1.5 text-rose-700 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          {t("routines.section.overdue", { n: counts.overdue })}
        </span>
      </div>

      {/* Body */}
      <div className="px-4 sm:px-5 pb-4 sm:pb-5">
        {loading ? (
          <div className="py-6 text-center text-[#7A7571]">
            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="bg-[#FAF9F6] rounded-2xl px-4 py-6 text-center border border-[#EFEBE4]">
            <Repeat className="w-6 h-6 mx-auto text-[#A09B95] mb-2" strokeWidth={1.6} />
            <p className="text-xs text-[#7A7571] leading-relaxed">
              {t("routines.empty")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((r) => (
              <RoutineCard
                key={r.id}
                routine={r}
                now={now}
                t={t}
                locale={undefined}
                onComplete={(rt) => setCompleteTarget(rt)}
                onSnooze={(rt) => setSnoozeTarget(rt)}
                onEdit={(rt) => {
                  setEditorInitial(rt);
                  setEditorOpen(true);
                }}
                onHistory={(rt) => {
                  setHistoryRoutine(rt);
                  setHistoryOpen(true);
                }}
                onDelete={(rt) => setDeleteTarget(rt)}
              />
            ))}
            {hasMore && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="w-full mt-1 inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#5C5853] bg-[#F3F0EA] hover:bg-[#E5E2DC] rounded-full py-2 active:scale-[0.99] transition"
                data-testid="routines-view-more-btn"
              >
                {expanded ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" strokeWidth={2.2} />
                    {t("routines.viewLess")}
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" strokeWidth={2.2} />
                    {t("routines.viewMore")} ({sorted.length - PREVIEW_COUNT})
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <RoutineEditor
        open={editorOpen}
        onOpenChange={(v) => {
          setEditorOpen(v);
          if (!v) setEditorInitial(null);
        }}
        initial={editorInitial}
        onSave={handleSave}
      />
      <RoutineHistoryDialog
        open={historyOpen}
        onOpenChange={(v) => {
          setHistoryOpen(v);
          if (!v) setHistoryRoutine(null);
        }}
        routine={historyRoutine}
      />
      <CompleteDialog
        open={!!completeTarget}
        onOpenChange={(v) => !v && setCompleteTarget(null)}
        routine={completeTarget}
        onConfirm={handleComplete}
      />
      <Dialog open={!!snoozeTarget} onOpenChange={(v) => !v && setSnoozeTarget(null)}>
        <DialogContent className="max-w-xs rounded-3xl border border-[#E5E2DC] bg-white">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg text-[#2D2A26]">
              {t("routines.snooze")}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#7A7571]">
              {snoozeTarget?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2">
            {[
              { label: t("routines.snooze.1h"), m: 60 },
              { label: t("routines.snooze.4h"), m: 240 },
              { label: t("routines.snooze.1d"), m: 1440 },
            ].map((o) => (
              <Button
                key={o.m}
                variant="outline"
                onClick={() => handleSnooze(o.m)}
                className="rounded-full border-[#E5E2DC]"
                data-testid={`routine-inline-snooze-${o.m}`}
              >
                {o.label}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
      >
        <AlertDialogContent className="rounded-3xl border border-[#E5E2DC] bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-lg text-[#2D2A26]">
              {t("routines.delete")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-[#5C5853]">
              {t("routines.delete.confirm")}
              {deleteTarget && (
                <span className="block mt-3 px-3 py-2 rounded-xl bg-[#F3F0EA] text-[#2D2A26] text-xs font-semibold">
                  {deleteTarget.title}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-full">
              {t("btn.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              className="rounded-full bg-[#B91C1C] hover:bg-[#991414] text-white"
              data-testid="routine-inline-delete-confirm"
            >
              <Trash2 className="w-4 h-4 mr-1.5 rtl:mr-0 rtl:ml-1.5" />
              {t("btn.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default WallBoardRoutines;
