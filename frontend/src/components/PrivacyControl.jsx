// Persistent per-item privacy control.
//
// Rendered next to the existing Edit / Archive / Delete buttons on every
// shareable item row. Always available — the user can change an item's
// privacy at any time, not just during the post-create grace period.
//
// The icon reflects the current visibility:
//   👁  Eye        → "family" (everyone in the family can see it)
//   🔒  Lock       → "owner_only" (only the creator)
//   👥  Users      → "members" (a hand-picked list)
//
// Clicking opens a small dialog with the three options. If the item is
// still in its post-create grace window, we extend the deadline on the
// server first so auto-publish doesn't fire while the picker is open
// (per spec — "إذا ضغط المستخدم على زر العين … يجب إيقاف النشر التلقائي").

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Users, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/api";
import {
  patchItemVisibility,
  makeOwnerOnly,
  shareWithMembers,
  shareWithFamily,
} from "@/lib/privacyApi";

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
 * @param {object} props
 * @param {string} props.kind   - backend collection name
 * @param {object} props.item   - the item itself
 * @param {function} props.onChanged - callback fired after a successful patch
 * @param {string=} props.size  - "sm" (default) | "xs"
 */
export default function PrivacyControl({ kind, item, onChanged, size = "sm" }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const visibility = item?.visibility || "family";
  const Icon = ICONS[visibility] || Eye;
  const accent = ACCENT[visibility] || ACCENT.family;
  const dim = size === "xs" ? "w-7 h-7" : "w-8 h-8";
  const iconDim = size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5";

  // When opened during the grace period, extend it so the auto-publish
  // doesn't fire while the picker is on screen.
  const onOpen = async () => {
    setOpen(true);
    if (!item) return;
    const p = item.pending_publish_at;
    if (p && Date.parse(p) > Date.now()) {
      try {
        await patchItemVisibility(kind, item.id, { extend_grace: true });
      } catch {
        /* best-effort — if the extend fails the worst case is the auto-publish
           still fires while the user picks. The follow-up PATCH overrides it. */
      }
    }
  };

  const handlePicked = async (choice, memberIds) => {
    try {
      if (choice === "family") {
        await shareWithFamily(kind, item.id);
      } else if (choice === "owner_only") {
        await makeOwnerOnly(kind, item.id);
      } else if (choice === "members") {
        await shareWithMembers(kind, item.id, memberIds);
      }
      toast.success(t("privacy.toast.privacyUpdated"));
      onChanged && onChanged();
    } catch {
      toast.error(t("privacy.toast.error"));
    } finally {
      setOpen(false);
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
      <PrivacyPickerDialog open={open} onOpenChange={setOpen} onPicked={handlePicked} current={visibility} />
    </>
  );
}

// Identical-looking picker to the one used by the post-create toast, but
// reused as a standalone export so other surfaces can render it without
// pulling in the whole toast.
export function PrivacyPickerDialog({ open, onOpenChange, onPicked, current = "family" }) {
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
          <OptionCard
            icon={<Eye className="w-4 h-4 text-[#5B8C5A]" />}
            title={t("privacy.option.family.title")}
            desc={t("privacy.option.family.desc")}
            active={current === "family"}
            onClick={() => onPicked("family")}
            testid="privacy-option-family"
          />
          <OptionCard
            icon={<EyeOff className="w-4 h-4 text-[#7A7571]" />}
            title={t("privacy.option.ownerOnly.title")}
            desc={t("privacy.option.ownerOnly.desc")}
            active={current === "owner_only"}
            onClick={() => onPicked("owner_only")}
            testid="privacy-option-owner-only"
          />
          <div
            className={`rounded-2xl border p-3 ${
              current === "members" ? "border-[#2D2A26]" : "border-[#E5E2DC]"
            }`}
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
              {loading ? (
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
                    className="flex items-center gap-2 px-2 py-1 rounded-xl hover:bg-[#FAF9F6] cursor-pointer"
                    data-testid={`privacy-member-${m.id}`}
                  >
                    <Checkbox
                      checked={!!selected[m.id]}
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

function OptionCard({ icon, title, desc, onClick, active, testid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-start flex items-start gap-2 px-3 py-3 rounded-2xl border transition-colors ${
        active
          ? "border-[#2D2A26] bg-[#FAF9F6]"
          : "border-[#E5E2DC] hover:border-[#2D2A26] hover:bg-[#FAF9F6]"
      }`}
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
