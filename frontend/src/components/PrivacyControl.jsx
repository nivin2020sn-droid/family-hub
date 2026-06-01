// Persistent per-item privacy control.
//
// Rendered next to the existing Edit / Archive / Delete buttons on every
// shareable item row. Always available — the user can change an item's
// privacy at any time, not just during the post-create grace period.
//
// The icon reflects the current visibility:
//   Eye        → "family" (everyone in the family can see it)
//   EyeOff     → "owner_only" (only the creator)
//   Users      → "members" (a hand-picked list)
//
// Behaviour: the icon and dialog only reflect what the SERVER confirmed.
// We never optimistically flip the UI — if the PATCH fails the icon stays
// exactly where it was, and the real backend error message is shown.

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Users, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/api";
import { patchItemVisibility } from "@/lib/privacyApi";

const ICONS = {
  family: Eye,
  owner_only: EyeOff,
  members: Users,
};

const ACCENT = {
  family: "text-[#5B8C5A]",
  owner_only: "text-[#7A7571]",
  members: "text-[#5B4B8A]",
};

/**
 * Best-effort human-readable error for a failed PATCH. Falls back to the
 * generic i18n message when the backend didn't return anything useful.
 */
function extractError(err, fallback) {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object" && detail.message) return detail.message;
  if (err?.message && !/network/i.test(err.message)) return err.message;
  return fallback;
}

/**
 * @param {object} props
 * @param {string} props.kind   - backend collection name (wall_notes, wall_goals, ...)
 * @param {object} props.item   - the item itself (must carry `id` and `visibility`)
 * @param {function} props.onChanged - optional callback fired AFTER a successful patch
 * @param {string=} props.size  - "sm" (default) | "xs"
 */
export default function PrivacyControl({ kind, item, onChanged, size = "sm" }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  // Server-confirmed state. We deliberately keep a local mirror so the icon
  // reflects the LAST successful save even if the parent hasn't refetched
  // yet. We only ever update it from PATCH responses — never optimistically.
  const [visibility, setVisibility] = useState(item?.visibility || "family");
  const [visibleTo, setVisibleTo] = useState(item?.visible_to || []);

  // If the parent prop changes (e.g. a re-fetch landed), trust the parent.
  useEffect(() => {
    if (item) {
      setVisibility(item.visibility || "family");
      setVisibleTo(item.visible_to || []);
    }
  }, [item?.id, item?.visibility, item?.visible_to]);

  const Icon = ICONS[visibility] || Eye;
  const accent = ACCENT[visibility] || ACCENT.family;
  const dim = size === "xs" ? "w-7 h-7" : "w-8 h-8";
  const iconDim = size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5";

  // When the picker opens during the grace window, push the deadline 5min
  // out so auto-publish doesn't fire while the user is still deciding.
  const onOpen = async () => {
    setOpen(true);
    if (!item) return;
    const p = item.pending_publish_at;
    if (p && Date.parse(p) > Date.now()) {
      try {
        await patchItemVisibility(kind, item.id, { extend_grace: true });
      } catch {
        /* best-effort */
      }
    }
  };

  // Single source of truth for "apply a privacy choice".
  // Saves to server FIRST, only updates the icon on success.
  const applyChoice = async (choice, memberIds) => {
    if (!item?.id) return;
    const body = { publish_now: true };
    if (choice === "family") body.visibility = "family";
    else if (choice === "owner_only") body.visibility = "owner_only";
    else if (choice === "members") {
      body.visibility = "members";
      body.visible_to = memberIds || [];
    } else {
      return;
    }
    let fresh = null;
    try {
      fresh = await patchItemVisibility(kind, item.id, body);
    } catch (err) {
      toast.error(extractError(err, t("privacy.toast.error")));
      return; // KEEP the dialog open so the user can retry.
    }
    // Server confirmed — update local icon from the response, NOT the input.
    if (fresh && fresh.visibility) {
      setVisibility(fresh.visibility);
      setVisibleTo(fresh.visible_to || []);
    }
    toast.success(t("privacy.toast.privacyUpdated"));
    setOpen(false);
    // Fire the parent callback outside our try/catch so a bug in the parent
    // (e.g. an undefined method) can't turn a successful save into an error
    // toast. We still surface the failure to the console for debugging.
    if (typeof onChanged === "function") {
      Promise.resolve()
        .then(() => onChanged(fresh))
        .catch((e) => console.warn("[PrivacyControl] onChanged threw:", e));
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className={`${dim} rounded-full bg-white/70 hover:bg-white flex items-center justify-center ${accent} active:scale-95 transition`}
        aria-label={t("privacy.button.label")}
        title={t(`privacy.option.${visibility === "family" ? "family" : visibility === "owner_only" ? "ownerOnly" : "members"}.title`)}
        data-testid={`privacy-control-${kind}-${item.id}`}
      >
        <Icon className={iconDim} strokeWidth={2.2} />
      </button>
      <PrivacyPickerDialog
        open={open}
        onOpenChange={setOpen}
        onPicked={applyChoice}
        current={visibility}
        currentMembers={visibleTo}
      />
    </>
  );
}

// Identical-looking picker to the one used by the post-create toast, but
// reused as a standalone export so other surfaces can render it without
// pulling in the whole toast.
//
// `onPicked(choice, memberIds)` returns a Promise. While the promise is
// pending we keep the dialog open, disable every button, and show a
// spinner on the one the user clicked. The dialog only closes when the
// owner closes it themselves (cancel/X) or `onPicked` resolves; on a
// failed save the parent keeps it open so the user can retry.
export function PrivacyPickerDialog({ open, onOpenChange, onPicked, current = "family", currentMembers = [] }) {
  const { t } = useI18n();
  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState({});
  const [loadingMembers, setLoadingMembers] = useState(false);
  // Which option the user clicked → drives the spinner & the global disable.
  const [pendingChoice, setPendingChoice] = useState(null);
  const busy = pendingChoice !== null;

  // Pre-seed the "specific members" checkboxes from the current value so
  // the user can tweak an existing list instead of re-picking from scratch.
  useEffect(() => {
    if (!open) {
      setPendingChoice(null);
      setSelected({});
      return;
    }
    const seed = {};
    (currentMembers || []).forEach((id) => { seed[id] = true; });
    setSelected(seed);
  }, [open, currentMembers]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingMembers(true);
    api.get("/family/members")
      .then((r) => { if (!cancelled) setMembers(r.data || []); })
      .catch(() => { if (!cancelled) setMembers([]); })
      .finally(() => { if (!cancelled) setLoadingMembers(false); });
    return () => { cancelled = true; };
  }, [open]);

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((k) => selected[k]),
    [selected],
  );

  const handlePick = async (choice, memberIds) => {
    if (busy) return;
    setPendingChoice(choice);
    try {
      await onPicked(choice, memberIds);
    } finally {
      setPendingChoice(null);
    }
  };

  // Block accidental closing while a save is in flight.
  const handleOpenChange = (next) => {
    if (busy && !next) return;
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
          <OptionCard
            icon={<Eye className="w-4 h-4 text-[#5B8C5A]" />}
            title={t("privacy.option.family.title")}
            desc={t("privacy.option.family.desc")}
            active={current === "family"}
            disabled={busy}
            loading={pendingChoice === "family"}
            onClick={() => handlePick("family")}
            testid="privacy-option-family"
          />
          <OptionCard
            icon={<EyeOff className="w-4 h-4 text-[#7A7571]" />}
            title={t("privacy.option.ownerOnly.title")}
            desc={t("privacy.option.ownerOnly.desc")}
            active={current === "owner_only"}
            disabled={busy}
            loading={pendingChoice === "owner_only"}
            onClick={() => handlePick("owner_only")}
            testid="privacy-option-owner-only"
          />
          <div
            className={`rounded-2xl border p-3 ${
              current === "members" ? "border-[#2D2A26]" : "border-[#E5E2DC]"
            } ${busy ? "opacity-60" : ""}`}
            data-testid="privacy-option-members-wrap"
          >
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
              {loadingMembers ? (
                <div className="py-2 flex justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-[#7A7571]" />
                </div>
              ) : members.length === 0 ? (
                <div className="text-[10px] text-[#7A7571] py-2 text-center">
                  {t("privacy.option.members.empty")}
                </div>
              ) : (
                members.map((m) => (
                  <label
                    key={m.id}
                    className={`flex items-center gap-2 px-2 py-1 rounded-xl hover:bg-[#FAF9F6] ${busy ? "cursor-not-allowed" : "cursor-pointer"}`}
                    data-testid={`privacy-member-${m.id}`}
                  >
                    <Checkbox
                      checked={!!selected[m.id]}
                      disabled={busy}
                      onCheckedChange={() =>
                        setSelected((s) => ({ ...s, [m.id]: !s[m.id] }))
                      }
                    />
                    <span className="text-xs text-[#2D2A26]">{m.name}</span>
                  </label>
                ))
              )}
            </div>
            <Button
              type="button"
              disabled={busy || selectedIds.length === 0}
              onClick={() => handlePick("members", selectedIds)}
              className="mt-2 w-full rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white h-9 inline-flex items-center justify-center gap-2"
              data-testid="privacy-option-members-confirm"
            >
              {pendingChoice === "members" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t("privacy.option.members.confirm")} ({selectedIds.length})
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            className="rounded-full"
            disabled={busy}
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

function OptionCard({ icon, title, desc, onClick, active, disabled, loading, testid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-start flex items-start gap-2 px-3 py-3 rounded-2xl border transition-colors ${
        active
          ? "border-[#2D2A26] bg-[#FAF9F6]"
          : "border-[#E5E2DC] hover:border-[#2D2A26] hover:bg-[#FAF9F6]"
      } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
      data-testid={testid}
    >
      <span className="mt-0.5 shrink-0">
        {loading ? <Loader2 className="w-4 h-4 animate-spin text-[#7A7571]" /> : icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-[#2D2A26]">{title}</span>
        <span className="block text-[11px] text-[#7A7571] leading-relaxed">{desc}</span>
      </span>
    </button>
  );
}
