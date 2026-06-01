// Sticky bottom toast for the pending-publish queue. Renders one entry
// at a time (FIFO). Shows a circular countdown ring + 3 actions:
//   - Change privacy → opens a small dialog with three modes
//   - Publish now    → clears the grace period server-side
//   - Undo           → deletes the row
//
// Designed to never block the user — the toast sits at bottom-center
// (mobile-safe), the rest of the app is unaffected, and the user can
// keep creating more items while a toast is up.

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Send, Undo2, X, Users } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { useI18n } from "@/lib/i18n";
import { useCountdown, usePrivacyQueue } from "@/lib/privacyQueue";
import {
  publishNow,
  makeOwnerOnly,
  shareWithMembers,
  shareWithFamily,
} from "@/lib/privacyApi";
import { api } from "@/lib/api";

const GRACE_SECONDS = 7;

export default function PrivacyPublishToast() {
  const { queue, remove } = usePrivacyQueue();
  const entry = queue[0]; // FIFO — show oldest first
  if (!entry) return null;
  return <ToastBody key={`${entry.kind}-${entry.id}`} entry={entry} remove={remove} />;
}

function ToastBody({ entry, remove }) {
  const { t } = useI18n();
  const remaining = useCountdown(entry.deadline);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Auto-dismiss when the deadline passes — the backend has already
  // published the row, the toast just leaves the queue silently.
  useEffect(() => {
    if (remaining <= 0) {
      const t = setTimeout(() => remove(entry.kind, entry.id), 250);
      return () => clearTimeout(t);
    }
  }, [remaining, entry.kind, entry.id, remove]);

  const close = () => remove(entry.kind, entry.id);

  const onUndo = async () => {
    setBusy(true);
    try {
      // Map collection name → DELETE path. Each kind has its own URL.
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

  const onPublishNow = async () => {
    setBusy(true);
    try {
      await publishNow(entry.kind, entry.id);
      toast.success(t("privacy.toast.published"));
    } catch {
      toast.error(t("privacy.toast.error"));
    } finally {
      setBusy(false);
      close();
    }
  };

  // Progress ring stroke — 0..100 based on remaining seconds.
  const pct = Math.max(0, Math.min(1, remaining / GRACE_SECONDS));
  const dash = 2 * Math.PI * 14;
  const offset = dash * (1 - pct);

  return (
    <>
      <div
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[80] w-[calc(100%-32px)] max-w-sm"
        data-testid={`privacy-toast-${entry.kind}-${entry.id}`}
      >
        <div className="rounded-2xl bg-[#1F1B17] text-white shadow-2xl border border-white/10 px-3 py-2.5 flex items-center gap-3">
          {/* Countdown ring */}
          <div className="relative w-9 h-9 shrink-0">
            <svg viewBox="0 0 32 32" className="w-9 h-9 -rotate-90">
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
          {/* Label */}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider opacity-60 leading-tight">
              {t("privacy.toast.heading")}
            </div>
            <div className="text-[12px] font-semibold leading-tight truncate" title={entry.label}>
              {entry.label}
            </div>
          </div>
          {/* Action stack */}
          <div className="flex items-center gap-1 shrink-0">
            <ActionBtn
              icon={<Eye className="w-3.5 h-3.5" />}
              label={t("privacy.toast.changePrivacy")}
              disabled={busy}
              onClick={() => setPickerOpen(true)}
              testid="privacy-toast-change"
            />
            <ActionBtn
              icon={<Send className="w-3.5 h-3.5" />}
              label={t("privacy.toast.publishNow")}
              disabled={busy}
              onClick={onPublishNow}
              testid="privacy-toast-publish-now"
            />
            <ActionBtn
              icon={<Undo2 className="w-3.5 h-3.5" />}
              label={t("privacy.toast.undo")}
              disabled={busy}
              onClick={onUndo}
              testid="privacy-toast-undo"
            />
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
      </div>
      <PrivacyPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPicked={async (choice, memberIds) => {
          setPickerOpen(false);
          setBusy(true);
          try {
            if (choice === "family") {
              await shareWithFamily(entry.kind, entry.id);
            } else if (choice === "owner_only") {
              await makeOwnerOnly(entry.kind, entry.id);
            } else if (choice === "members") {
              await shareWithMembers(entry.kind, entry.id, memberIds);
            }
            toast.success(t("privacy.toast.privacyUpdated"));
          } catch {
            toast.error(t("privacy.toast.error"));
          } finally {
            setBusy(false);
            close();
          }
        }}
      />
    </>
  );
}

function ActionBtn({ icon, label, onClick, disabled, testid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="h-7 px-2 rounded-full inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider bg-white/8 hover:bg-white/15 disabled:opacity-40 transition-colors"
      data-testid={testid}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// Mini dialog with the 3 privacy modes. For "members" we fetch the
// family roster lazily on open so picking specific people works without
// pre-loading every roster on every page.
function PrivacyPicker({ open, onOpenChange, onPicked }) {
  const { t } = useI18n();
  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState({});
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    api.get("/family/members")
      .then((r) => { if (!cancelled) setMembers(r.data || []); })
      .catch(() => { if (!cancelled) setMembers([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);
  const toggle = (id) =>
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  const selectedIds = useMemo(
    () => Object.keys(selected).filter((k) => selected[k]),
    [selected],
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-3xl border border-[#E5E2DC] bg-white">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg text-[#2D2A26]">
            {t("privacy.picker.title")}
          </DialogTitle>
          <DialogDescription className="text-xs text-[#7A7571]">
            {t("privacy.picker.desc")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 mt-2">
          <PrivacyOption
            icon={<Eye className="w-4 h-4 text-[#5B8C5A]" />}
            title={t("privacy.option.family.title")}
            desc={t("privacy.option.family.desc")}
            onClick={() => onPicked("family")}
            testid="privacy-option-family"
          />
          <PrivacyOption
            icon={<EyeOff className="w-4 h-4 text-[#7A7571]" />}
            title={t("privacy.option.ownerOnly.title")}
            desc={t("privacy.option.ownerOnly.desc")}
            onClick={() => onPicked("owner_only")}
            testid="privacy-option-owner-only"
          />
          {/* "Members" needs a roster picker — expand inline. */}
          <div className="rounded-2xl border border-[#E5E2DC] p-3" data-testid="privacy-option-members-wrap">
            <div className="flex items-start gap-2">
              <Users className="w-4 h-4 text-[#5B4B8A] mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-[#2D2A26]">
                  {t("privacy.option.members.title")}
                </div>
                <div className="text-[11px] text-[#7A7571]">
                  {t("privacy.option.members.desc")}
                </div>
              </div>
            </div>
            <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
              {loading ? (
                <div className="text-[10px] text-[#7A7571] py-2 text-center">…</div>
              ) : members.length === 0 ? (
                <div className="text-[10px] text-[#7A7571] py-2 text-center">
                  {t("privacy.option.members.empty")}
                </div>
              ) : (
                members.map((m) => (
                  <label
                    key={m.id}
                    className="flex items-center gap-2 px-2 py-1 rounded-xl hover:bg-[#FAF9F6] cursor-pointer"
                    data-testid={`privacy-member-${m.id}`}
                  >
                    <Checkbox
                      checked={!!selected[m.id]}
                      onCheckedChange={() => toggle(m.id)}
                    />
                    <span className="text-xs text-[#2D2A26]">{m.name}</span>
                  </label>
                ))
              )}
            </div>
            <Button
              type="button"
              disabled={selectedIds.length === 0}
              onClick={() => onPicked("members", selectedIds)}
              className="mt-2 w-full rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white h-9"
              data-testid="privacy-option-members-confirm"
            >
              {t("privacy.option.members.confirm")} ({selectedIds.length})
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            className="rounded-full"
            onClick={() => onOpenChange(false)}
            data-testid="privacy-picker-cancel"
          >
            {t("btn.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PrivacyOption({ icon, title, desc, onClick, testid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-start flex items-start gap-2 px-3 py-3 rounded-2xl border border-[#E5E2DC] hover:border-[#2D2A26] hover:bg-[#FAF9F6] transition-colors"
      data-testid={testid}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-[#2D2A26]">{title}</span>
        <span className="block text-[11px] text-[#7A7571] leading-relaxed">{desc}</span>
      </span>
    </button>
  );
}

// DELETE URLs per kind. Kept here (not in privacyApi) because they're
// presentation glue — the toast doesn't need a separate import for them.
const DELETE_PATHS = {
  wall_notes: "/wall/notes",
  wall_goals: "/wall/goals",
  wall_countdown: "/wall/countdown",
  wall_family_events: "/wall/family-events",
  shopping_items: "/shopping",
  routines: "/routines",
};
