import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Heart,
  Image as ImageIcon,
  Target,
  CalendarClock,
  StickyNote,
  Trophy,
  Home as HomeIcon,
  CalendarHeart,
  Wallet,
  Settings as SettingsIcon,
  Menu,
  LogOut,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  CalendarDays,
  Loader2,
  RefreshCw,
  Archive,
  ArchiveRestore,
  History as HistoryIcon,
  Clock,
  Repeat,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { logout as authLogout } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import FamilyMapCard from "@/components/FamilyMapCard";
import {
  wallSettings,
  wallPhotos,
  wallGoals,
  wallCountdown,
  wallAchievements,
  wallNotes,
  wallFamilyEvents,
  fileToCompressedDataUrl,
  flushQueue,
  pendingSyncCount,
} from "@/lib/wallApi";

// ---------- Utilities ----------
const uuid = () =>
  (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : "x-" + Math.random().toString(36).slice(2) + Date.now().toString(36));

function daysUntil(isoDate) {
  if (!isoDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(isoDate + "T00:00:00");
  const ms = target.getTime() - today.getTime();
  return Math.ceil(ms / 86400000);
}

function formatLongDate(isoDate) {
  if (!isoDate) return "";
  try {
    return new Date(isoDate + "T00:00:00").toLocaleDateString("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return isoDate;
  }
}

function formatDateTime(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const NOTE_COLORS = ["#60A5FA", "#34D399", "#A78BFA", "#F87171", "#FBBF24", "#F472B6"];

// ---------- Section shell ----------
const SectionCard = ({
  icon: Icon,
  title,
  accent,
  iconBg,
  onAdd,
  onEdit,
  addLabel = "Add",
  children,
  testid,
  className = "",
}) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.35 }}
    className={`rounded-3xl p-4 sm:p-5 border border-black/[0.04] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.08)] ${className}`}
    style={{ backgroundColor: accent }}
    data-testid={testid}
  >
    <div className="flex items-center gap-2.5 mb-3">
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-white shadow-sm"
        style={{ backgroundColor: iconBg }}
      >
        <Icon className="w-4.5 h-4.5" strokeWidth={2} />
      </div>
      <h3 className="font-heading text-base sm:text-lg font-semibold text-[#2D2A26] tracking-tight flex-1">
        {title}
      </h3>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="w-8 h-8 rounded-full bg-white/70 hover:bg-white flex items-center justify-center text-[#2D2A26] active:scale-95 transition"
          data-testid={`${testid}-edit-btn`}
          aria-label="Edit"
        >
          <Pencil className="w-3.5 h-3.5" strokeWidth={2} />
        </button>
      )}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="w-8 h-8 rounded-full bg-white/70 hover:bg-white flex items-center justify-center text-[#2D2A26] active:scale-95 transition"
          data-testid={`${testid}-add-btn`}
          aria-label={addLabel}
        >
          <Plus className="w-4 h-4" strokeWidth={2} />
        </button>
      )}
    </div>
    {children}
  </motion.div>
);

const EmptyState = ({ text, onAdd, label = "Add" }) => (
  <div className="bg-white/70 rounded-2xl px-4 py-5 text-center">
    <p className="text-sm text-[#7A7571] mb-2">{text}</p>
    {onAdd && (
      <button
        type="button"
        onClick={onAdd}
        className="text-xs font-semibold text-[#2D2A26] inline-flex items-center gap-1 hover:underline"
      >
        <Plus className="w-3.5 h-3.5" /> {label}
      </button>
    )}
  </div>
);

// ---------- Bottom nav item ----------
const BottomNavItem = ({ icon: Icon, label, active, onClick, testid }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex flex-col items-center justify-center flex-1 min-h-[56px] py-1 transition-colors ${
      active ? "text-[#E11D48]" : "text-[#7A7571]"
    }`}
    data-testid={testid}
  >
    <div
      className={`flex items-center justify-center w-9 h-9 rounded-full transition-all ${
        active ? "bg-[#FEE2E5]" : "bg-transparent"
      }`}
    >
      <Icon className="w-[18px] h-[18px]" strokeWidth={1.9} />
    </div>
    <span className={`text-[10px] mt-0.5 font-medium tracking-wide ${active ? "font-semibold" : ""}`}>
      {label}
    </span>
  </button>
);

// ---------- Hero editor ----------
const HeroEditor = ({ open, onOpenChange, settings, onSave }) => {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (open) {
      setTitle(settings.hero_title || "");
      setSubtitle(settings.hero_subtitle || "");
      setPhoto(settings.hero_photo || null);
    }
  }, [open, settings]);

  const handlePick = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setBusy(true);
    try {
      const data = await fileToCompressedDataUrl(file, { maxDim: 1400, quality: 0.82 });
      setPhoto(data);
    } catch {
      toast.error(t("settings.toast.cantReadImage"));
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      await onSave({ hero_title: title, hero_subtitle: subtitle, hero_photo: photo });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl border border-[#E5E2DC] bg-white" data-testid="hero-editor">
        <DialogHeader>
          <DialogTitle>{t("hero.editTitle")}</DialogTitle>
          <DialogDescription className="text-xs text-[#7A7571]">
            {t("hero.editDesc")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-wider text-[#7A7571]">{t("hero.familyPhoto")}</Label>
            <div className="mt-2 rounded-2xl overflow-hidden bg-[#F3F0EA] aspect-[16/9] flex items-center justify-center relative">
              {photo ? (
                <img src={photo} alt="" className="w-full h-full object-cover" />
              ) : (
                <p className="text-xs text-[#7A7571]">{t("hero.noPhoto")}</p>
              )}
            </div>
            <div className="flex gap-2 mt-2">
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={handlePick} />
              <Button
                type="button"
                variant="outline"
                className="flex-1 rounded-2xl"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                data-testid="hero-pick-photo"
              >
                {photo ? t("hero.changePhoto") : t("hero.uploadPhoto")}
              </Button>
              {photo && (
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-2xl text-[#B91C1C]"
                  onClick={() => setPhoto(null)}
                  disabled={busy}
                >
                  {t("hero.removePhoto")}
                </Button>
              )}
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-[#7A7571]">{t("hero.title")}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-2xl mt-1.5"
              data-testid="hero-title-input"
              placeholder={t("hero.defaultTitle")}
            />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-[#7A7571]">{t("hero.subtitle")}</Label>
            <Input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="rounded-2xl mt-1.5"
              data-testid="hero-subtitle-input"
              placeholder={t("hero.defaultSubtitle")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>
            {t("btn.cancel")}
          </Button>
          <Button
            className="rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white"
            onClick={handleSave}
            disabled={busy}
            data-testid="hero-save-btn"
          >
            {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            {t("btn.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Message of the Day editor ----------
const MessageEditor = ({ open, onOpenChange, settings, onSave }) => {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [title, setTitle] = useState("Message of the Day");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setText(settings.message_text || "");
      setTitle(settings.message_title || t("section.message"));
    }
  }, [open, settings, t]);

  const handleSave = async () => {
    setBusy(true);
    try {
      await onSave({ message_text: text, message_title: title });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl border border-[#E5E2DC] bg-white" data-testid="message-editor">
        <DialogHeader>
          <DialogTitle>{t("editor.message.title")}</DialogTitle>
          <DialogDescription className="text-xs text-[#7A7571]">
            {t("editor.message.desc")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs uppercase tracking-wider text-[#7A7571]">{t("hero.title")}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-2xl mt-1.5"
              data-testid="message-title-input"
            />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-[#7A7571]">{t("editor.message.text")}</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              className="rounded-2xl mt-1.5"
              data-testid="message-text-input"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>
            {t("btn.cancel")}
          </Button>
          <Button
            className="rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white"
            onClick={handleSave}
            disabled={busy}
            data-testid="message-save-btn"
          >
            {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            {t("btn.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Goal editor ----------
const GoalEditor = ({ open, onOpenChange, initial, onSave }) => {
  const { t } = useI18n();
  const [label, setLabel] = useState("");
  useEffect(() => {
    if (open) setLabel(initial?.label || "");
  }, [open, initial]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-3xl border border-[#E5E2DC] bg-white">
        <DialogHeader>
          <DialogTitle>{initial ? t("editor.goal.edit") : t("editor.goal.new")}</DialogTitle>
        </DialogHeader>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="rounded-2xl"
          data-testid="goal-label-input"
          autoFocus
        />
        <DialogFooter>
          <Button variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>
            {t("btn.cancel")}
          </Button>
          <Button
            className="rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white"
            onClick={() => label.trim() && onSave({ label: label.trim() })}
            disabled={!label.trim()}
            data-testid="goal-save-btn"
          >
            {t("btn.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Countdown editor ----------
const CountdownEditor = ({ open, onOpenChange, initial, onSave }) => {
  const { t } = useI18n();
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("");
  useEffect(() => {
    if (open) {
      setLabel(initial?.label || "");
      setDate(initial?.date || "");
    }
  }, [open, initial]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-3xl border border-[#E5E2DC] bg-white">
        <DialogHeader>
          <DialogTitle>{initial ? t("editor.cd.edit") : t("editor.cd.new")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs uppercase tracking-wider text-[#7A7571]">{t("hero.title")}</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="rounded-2xl mt-1.5"
              data-testid="cd-label-input"
            />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-[#7A7571]">{t("editor.field.date")}</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-2xl mt-1.5"
              data-testid="cd-date-input"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>
            {t("btn.cancel")}
          </Button>
          <Button
            className="rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white"
            onClick={() => label.trim() && date && onSave({ label: label.trim(), date })}
            disabled={!label.trim() || !date}
            data-testid="cd-save-btn"
          >
            {t("btn.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Achievement editor ----------
const AchievementEditor = ({ open, onOpenChange, initial, onSave }) => {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  useEffect(() => {
    if (open) {
      setName(initial?.name || "");
      setNote(initial?.note || "");
      setImage(initial?.image || null);
    }
  }, [open, initial]);
  const handlePick = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setBusy(true);
    try {
      const data = await fileToCompressedDataUrl(file, { maxDim: 600, quality: 0.78 });
      setImage(data);
    } catch {
      toast.error(t("settings.toast.cantReadImage"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-3xl border border-[#E5E2DC] bg-white">
        <DialogHeader>
          <DialogTitle>{initial ? t("editor.ach.edit") : t("editor.ach.new")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-[#F3F0EA] flex items-center justify-center text-2xl">
              {image ? (
                <img src={image} alt="" className="w-full h-full object-cover" />
              ) : (
                <Trophy className="w-6 h-6 text-[#7A7571]" />
              )}
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={handlePick} />
              <Button
                type="button"
                variant="outline"
                className="rounded-full text-xs"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
              >
                {image ? t("editor.ach.changePhoto") : t("editor.ach.addPhoto")}
              </Button>
              {image && (
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-full text-xs text-[#B91C1C]"
                  onClick={() => setImage(null)}
                >
                  {t("editor.ach.removePhoto")}
                </Button>
              )}
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-[#7A7571]">{t("editor.field.name")}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-2xl mt-1.5"
              data-testid="ach-name-input"
            />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-[#7A7571]">{t("editor.field.note")}</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="rounded-2xl mt-1.5"
              data-testid="ach-note-input"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>
            {t("btn.cancel")}
          </Button>
          <Button
            className="rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white"
            onClick={() => name.trim() && onSave({ name: name.trim(), note: note.trim(), image })}
            disabled={!name.trim() || busy}
            data-testid="ach-save-btn"
          >
            {t("btn.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Note editor ----------
const NoteEditor = ({ open, onOpenChange, initial, onSave }) => {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [color, setColor] = useState(NOTE_COLORS[0]);
  useEffect(() => {
    if (open) {
      setText(initial?.text || "");
      setColor(initial?.color || NOTE_COLORS[0]);
    }
  }, [open, initial]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-3xl border border-[#E5E2DC] bg-white">
        <DialogHeader>
          <DialogTitle>{initial ? t("editor.note.edit") : t("editor.note.new")}</DialogTitle>
        </DialogHeader>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="rounded-2xl"
          data-testid="note-text-input"
          autoFocus
        />
        <div>
          <Label className="text-xs uppercase tracking-wider text-[#7A7571]">{t("editor.field.color")}</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {NOTE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full transition-transform ${
                  color === c ? "ring-2 ring-offset-2 ring-[#2D2A26] scale-110" : ""
                }`}
                style={{ backgroundColor: c }}
                aria-label={c}
              />
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>
            {t("btn.cancel")}
          </Button>
          <Button
            className="rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white"
            onClick={() => text.trim() && onSave({ text: text.trim(), color })}
            disabled={!text.trim()}
            data-testid="note-save-btn"
          >
            {t("btn.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Family event editor ----------
const FamilyEventEditor = ({ open, onOpenChange, initial, onSave }) => {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  useEffect(() => {
    if (open) {
      setTitle(initial?.title || "");
      setDate(initial?.date || "");
      setNotes(initial?.notes || "");
    }
  }, [open, initial]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-3xl border border-[#E5E2DC] bg-white">
        <DialogHeader>
          <DialogTitle>{initial ? t("editor.fe.edit") : t("editor.fe.new")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs uppercase tracking-wider text-[#7A7571]">{t("hero.title")}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-2xl mt-1.5"
              data-testid="fe-title-input"
            />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-[#7A7571]">{t("editor.field.date")}</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-2xl mt-1.5"
              data-testid="fe-date-input"
            />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-[#7A7571]">{t("editor.field.notes")}</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-2xl mt-1.5"
              placeholder={t("editor.field.optional")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>
            {t("btn.cancel")}
          </Button>
          <Button
            className="rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white"
            onClick={() => title.trim() && date && onSave({ title: title.trim(), date, notes: notes.trim() })}
            disabled={!title.trim() || !date}
            data-testid="fe-save-btn"
          >
            {t("btn.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Goal history dialog ----------
const HISTORY_FIELD_KEYS = [
  { key: "created_at", labelKey: "history.created", icon: Plus },
  { key: "updated_at", labelKey: "history.edited", icon: Pencil },
  { key: "completed_at", labelKey: "history.completed", icon: Check },
  { key: "archived_at", labelKey: "history.archivedAt", icon: Archive },
];

const GoalHistoryDialog = ({ open, onOpenChange, onRestore, onDelete }) => {
  const { t } = useI18n();
  const [allGoals, setAllGoals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await wallGoals.listAll();
      setAllGoals(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setSelectedId(null);
      setAllGoals(wallGoals.cachedAll());
      refresh();
    }
  }, [open]);

  const active = allGoals.filter((g) => !g.archived_at);
  const archived = allGoals.filter((g) => g.archived_at);
  const selected = selectedId ? allGoals.find((g) => g.id === selectedId) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md rounded-3xl border border-[#E5E2DC] bg-white p-0 overflow-hidden max-h-[85vh] flex flex-col"
        data-testid="goal-history-dialog"
      >
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-[#EFEBE4]">
          <DialogTitle className="font-heading text-xl font-medium tracking-tight text-[#2D2A26] flex items-center gap-2">
            <HistoryIcon className="w-4 h-4 text-[#16A34A]" />
            {t("history.title")}
          </DialogTitle>
          <DialogDescription className="text-xs text-[#7A7571]">
            {selected ? t("history.descDetail") : t("history.descList")}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto px-5 py-4 space-y-5 flex-1">
          {loading && allGoals.length === 0 && (
            <div className="flex items-center justify-center py-10 text-[#7A7571] text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> …
            </div>
          )}

          {selected ? (
            <div data-testid="goal-history-detail">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="text-xs font-semibold text-[#7A7571] hover:text-[#2D2A26] mb-3 inline-flex items-center gap-1"
                data-testid="goal-history-back-btn"
              >
                {t("history.back")}
              </button>
              <div className="rounded-2xl bg-[#F3F0EA]/60 border border-[#E5E2DC] p-4">
                <p className="text-sm font-semibold text-[#2D2A26] break-words">
                  {selected.label}
                </p>
                {selected.archived_at && (
                  <span className="inline-block mt-1.5 text-[10px] uppercase tracking-wider text-[#92400E] bg-[#FEF3C7] px-2 py-0.5 rounded-full">
                    {t("history.archivedBadge")}
                  </span>
                )}
              </div>
              <ul className="mt-3 space-y-2">
                {HISTORY_FIELD_KEYS.map(({ key, labelKey, icon: Icon }) => {
                  const value = formatDateTime(selected[key]);
                  return (
                    <li
                      key={key}
                      className="flex items-start gap-3 px-3.5 py-2.5 rounded-xl bg-white border border-[#EFEBE4]"
                    >
                      <Icon className="w-4 h-4 text-[#7A7571] mt-0.5" strokeWidth={1.8} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] uppercase tracking-[0.15em] text-[#7A7571] font-semibold">
                          {t(labelKey)}
                        </p>
                        <p className="text-sm text-[#2D2A26] break-words">
                          {value || <span className="text-[#A09B95] italic">—</span>}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <>
              {/* Active goals */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7A7571] mb-2">
                  {t("history.active")} ({active.length})
                </p>
                {active.length === 0 ? (
                  <p className="text-xs text-[#A09B95] italic px-1">{t("history.noActive")}</p>
                ) : (
                  <ul className="space-y-2">
                    {active.map((g) => (
                      <li key={g.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(g.id)}
                          className="w-full text-left rounded-xl bg-white border border-[#EFEBE4] hover:bg-[#F3F0EA] active:scale-[0.99] transition px-3.5 py-2.5 flex items-center gap-2"
                          data-testid={`goal-history-row-${g.id}`}
                        >
                          {g.done ? (
                            <Check className="w-3.5 h-3.5 text-[#16A34A] flex-shrink-0" strokeWidth={3} />
                          ) : (
                            <span className="w-3.5 h-3.5 rounded-full border-2 border-[#E5E2DC] flex-shrink-0" />
                          )}
                          <span className="flex-1 text-sm text-[#2D2A26] break-words">{g.label}</span>
                          <Clock className="w-3.5 h-3.5 text-[#A09B95]" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Archived goals */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7A7571] mb-2">
                  {t("history.archived")} ({archived.length})
                </p>
                {archived.length === 0 ? (
                  <p className="text-xs text-[#A09B95] italic px-1">{t("history.noArchived")}</p>
                ) : (
                  <ul className="space-y-2">
                    {archived.map((g) => (
                      <li
                        key={g.id}
                        className="rounded-xl bg-[#FAF9F6] border border-[#EFEBE4] px-3.5 py-2.5 flex items-center gap-2"
                        data-testid={`goal-archived-row-${g.id}`}
                      >
                        <Archive className="w-3.5 h-3.5 text-[#A09B95] flex-shrink-0" strokeWidth={1.8} />
                        <button
                          type="button"
                          onClick={() => setSelectedId(g.id)}
                          className="flex-1 text-left text-sm text-[#3F3A36] break-words hover:underline"
                        >
                          {g.label}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await onRestore(g.id);
                            await refresh();
                          }}
                          className="text-[10px] font-semibold uppercase tracking-wider text-[#16A34A] bg-[#E3F1E0] hover:bg-[#D1E7CD] px-2.5 py-1.5 rounded-full inline-flex items-center gap-1"
                          data-testid={`goal-restore-btn-${g.id}`}
                        >
                          <ArchiveRestore className="w-3 h-3" strokeWidth={2} />
                          {t("btn.restore")}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await onDelete(g.id);
                            await refresh();
                          }}
                          className="w-7 h-7 rounded-full hover:bg-[#FEE2E2] flex items-center justify-center text-[#B91C1C] flex-shrink-0"
                          aria-label={t("btn.delete")}
                          data-testid={`goal-archived-delete-${g.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t border-[#EFEBE4] bg-[#FAF9F6]">
          <Button
            variant="ghost"
            className="rounded-full"
            onClick={() => onOpenChange(false)}
            data-testid="goal-history-close-btn"
          >
            {t("btn.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Settings dialog (bottom nav) ----------
const WallSettingsDialog = ({ open, onOpenChange, onForceSync, pendingCount }) => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [confirm, setConfirm] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const handleLogout = () => {
    if (!confirm) {
      setConfirm(true);
      return;
    }
    authLogout();
    onOpenChange(false);
    toast.success(t("login.signedOut"));
    navigate("/login", { replace: true });
  };
  const handleSync = async () => {
    setSyncing(true);
    try {
      await onForceSync();
    } finally {
      setSyncing(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setConfirm(false); }}>
      <DialogContent
        className="max-w-sm rounded-3xl border border-[#E5E2DC] bg-white p-0 overflow-hidden"
        data-testid="wall-settings-dialog"
      >
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="font-heading text-xl font-medium tracking-tight text-[#2D2A26]">
            {t("settings.title")}
          </DialogTitle>
          <DialogDescription className="text-sm text-[#7A7571]">
            {t("settings.desc")}
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 py-4 space-y-3">
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-[#E5E2DC] bg-[#F3F0EA]/40">
            <span className="text-sm text-[#2D2A26]">{t("settings.language")}</span>
            <LanguageSwitcher variant="full" />
          </div>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-2xl border border-[#E5E2DC] bg-[#F3F0EA]/40 hover:bg-[#F3F0EA] transition-colors disabled:opacity-60"
            data-testid="sync-now-btn"
          >
            <span className="flex items-center gap-2 text-sm text-[#2D2A26]">
              <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} strokeWidth={2} />
              {t("btn.syncNow")}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#7A7571]">
              {pendingCount > 0 ? t("sync.pending", { n: pendingCount }) : t("sync.synced")}
            </span>
          </button>
          <Button
            type="button"
            variant="outline"
            onClick={() => { onOpenChange(false); navigate("/time-plan"); }}
            className="w-full rounded-2xl border-[#E5E2DC] text-[#2D2A26] hover:bg-[#F3F0EA]"
            data-testid="open-timeplan-settings-btn"
          >
            {t("btn.openTimePlanSettings")}
          </Button>
        </div>
        <div className="px-6 pb-5 pt-1 border-t border-[#E5E2DC] bg-[#FAF9F6]">
          <button
            type="button"
            onClick={handleLogout}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 mt-3 rounded-xl text-xs font-medium tracking-wide transition-colors ${
              confirm
                ? "bg-[#FEE2E2] text-[#B91C1C] hover:bg-[#FECACA]"
                : "text-[#A09B95] hover:text-[#7A7571] hover:bg-[#F3F0EA]"
            }`}
            data-testid="wall-logout-btn"
          >
            <LogOut className="w-3.5 h-3.5" strokeWidth={2} />
            {confirm ? t("btn.signOutConfirm") : t("btn.signOut")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Routines entry card (link tile to /routines) ----------
const RoutinesEntryCard = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [counts, setCounts] = useState({ total: 0, overdue: 0, approaching: 0 });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const mod = await import("@/lib/routinesApi");
        const list = await mod.listRoutines();
        if (cancelled) return;
        const now = Date.now();
        let overdue = 0;
        let approaching = 0;
        list.forEach((r) => {
          const s = mod.statusFor(r, now);
          if (s === "red") overdue += 1;
          else if (s === "orange") approaching += 1;
        });
        setCounts({ total: list.length, overdue, approaching });
      } catch {
        /* offline / first run — leave defaults */
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <button
      type="button"
      onClick={() => navigate("/routines")}
      className="text-left rounded-3xl border border-black/[0.04] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.08)] overflow-hidden active:scale-[0.99] transition"
      style={{ backgroundColor: "#F3F0EA" }}
      data-testid="card-routines-entry"
    >
      <div className="flex items-center gap-3 px-4 sm:px-5 py-4">
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-sm flex-shrink-0"
          style={{ backgroundColor: "#7C3AED" }}
        >
          <Repeat className="w-5 h-5" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-heading text-base sm:text-lg font-semibold text-[#2D2A26] tracking-tight">
            {t("routines.title")}
          </h3>
          <p className="text-[11px] text-[#7A7571] mt-0.5 truncate">
            {counts.total === 0
              ? t("routines.empty")
              : `${counts.total} · ${counts.overdue} ${t("routines.status.red").toLowerCase()} · ${counts.approaching} ${t("routines.status.orange").toLowerCase()}`}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-[#7A7571] rtl:rotate-180 flex-shrink-0" strokeWidth={2} />
      </div>
    </button>
  );
};

// ---------- Main page ----------
const WallBoard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();

  const [settings, setSettings] = useState(() => wallSettings.cached());
  const [photos, setPhotos] = useState(() => wallPhotos.cached());
  const [goals, setGoals] = useState(() => wallGoals.cached());
  const [countdown, setCountdown] = useState(() => wallCountdown.cached());
  const [achievements, setAchievements] = useState(() => wallAchievements.cached());
  const [notes, setNotes] = useState(() => wallNotes.cached());
  const [familyEvents, setFamilyEvents] = useState(() => wallFamilyEvents.cached());

  const [photoIndex, setPhotoIndex] = useState(0);
  const [pending, setPending] = useState(() => pendingSyncCount());

  // Edit dialogs state
  const [heroOpen, setHeroOpen] = useState(false);
  const [msgOpen, setMsgOpen] = useState(false);
  const [goalEditor, setGoalEditor] = useState({ open: false, item: null });
  const [cdEditor, setCdEditor] = useState({ open: false, item: null });
  const [achEditor, setAchEditor] = useState({ open: false, item: null });
  const [noteEditor, setNoteEditor] = useState({ open: false, item: null });
  const [feEditor, setFeEditor] = useState({ open: false, item: null });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [goalHistoryOpen, setGoalHistoryOpen] = useState(false);
  const photoInputRef = useRef(null);

  // Initial load from server
  const refreshAll = async () => {
    const [s, p, g, c, a, n, fe] = await Promise.all([
      wallSettings.fetch(),
      wallPhotos.list(),
      wallGoals.list(),
      wallCountdown.list(),
      wallAchievements.list(),
      wallNotes.list(),
      wallFamilyEvents.list(),
    ]);
    setSettings(s || {});
    setPhotos(p || []);
    setGoals(g || []);
    setCountdown(c || []);
    setAchievements(a || []);
    setNotes(n || []);
    setFamilyEvents(fe || []);
    setPending(pendingSyncCount());
  };

  useEffect(() => {
    refreshAll().catch(() => {});
  }, []);

  // ----- Hero & MOTD -----
  const saveSettings = async (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    const r = await wallSettings.save(patch);
    if (r.queued) {
      toast.message(t("sync.savedLocally"));
      setPending(pendingSyncCount());
    } else if (r.ok) {
      toast.success(t("sync.saved"));
    } else {
      toast.error(t("sync.failed"));
    }
  };

  // ----- Photos -----
  const handlePhotoPick = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = await fileToCompressedDataUrl(file, { maxDim: 1280, quality: 0.82 });
      const optimistic = { id: uuid(), image: data, caption: "", created_at: new Date().toISOString() };
      setPhotos((prev) => [...prev, optimistic]);
      const r = await wallPhotos.create({ image: data }, optimistic);
      if (r.queued) {
        toast.message(t("settings.toast.photoLocal"));
        setPending(pendingSyncCount());
      } else if (r.ok) {
        toast.success(t("settings.toast.photoAdded"));
        setPhotos(wallPhotos.cached());
      } else {
        toast.error(t("settings.toast.failed"));
        setPhotos((prev) => prev.filter((x) => x.id !== optimistic.id));
      }
    } catch {
      toast.error(t("settings.toast.cantReadPhoto"));
    }
  };
  const handlePhotoDelete = async (id) => {
    setPhotos((prev) => prev.filter((x) => x.id !== id));
    setPhotoIndex(0);
    const r = await wallPhotos.remove(id);
    if (r.queued) setPending(pendingSyncCount());
  };

  // ----- Generic CRUD via collection -----
  const makeCrud = (collection, setList) => ({
    create: async (payload) => {
      const optimistic = { id: uuid(), ...payload, created_at: new Date().toISOString() };
      setList((prev) => [...prev, optimistic]);
      const r = await collection.create(payload, optimistic);
      if (r.queued) {
        toast.message(t("sync.savedLocally"));
        setPending(pendingSyncCount());
      } else if (r.ok) {
        setList(collection.cached());
      } else {
        toast.error(t("settings.toast.saveFailed"));
        setList((prev) => prev.filter((x) => x.id !== optimistic.id));
      }
    },
    update: async (id, payload) => {
      setList((prev) => prev.map((x) => (x.id === id ? { ...x, ...payload } : x)));
      const r = await collection.update(id, payload);
      if (r.queued) setPending(pendingSyncCount());
    },
    remove: async (id) => {
      setList((prev) => prev.filter((x) => x.id !== id));
      const r = await collection.remove(id);
      if (r.queued) setPending(pendingSyncCount());
    },
  });

  const goalsCrud = useMemo(() => makeCrud(wallGoals, setGoals), []);
  const cdCrud = useMemo(() => makeCrud(wallCountdown, setCountdown), []);
  const achCrud = useMemo(() => makeCrud(wallAchievements, setAchievements), []);
  const notesCrud = useMemo(() => makeCrud(wallNotes, setNotes), []);
  const feCrud = useMemo(() => makeCrud(wallFamilyEvents, setFamilyEvents), []);

  // ----- Sync -----
  const forceSync = async () => {
    const { sent, failed } = await flushQueue();
    setPending(pendingSyncCount());
    if (sent > 0) toast.success(t("sync.synced.toast", { n: sent }));
    else if (failed > 0) toast.warning(t("sync.pending.toast", { n: failed }));
    else toast.info(t("sync.upToDate"));
    await refreshAll();
  };

  useEffect(() => {
    const onOnline = async () => {
      await flushQueue();
      setPending(pendingSyncCount());
      await refreshAll();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  // ----- Derived -----
  const sortedCountdown = useMemo(() => {
    return [...countdown]
      .map((c) => ({ ...c, _days: daysUntil(c.date) }))
      .filter((c) => c._days === null || c._days >= 0 || true)
      .sort((a, b) => (a._days ?? 9999) - (b._days ?? 9999));
  }, [countdown]);

  const upcomingFamilyEvents = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return [...familyEvents]
      .filter((e) => e.date >= today)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [familyEvents]);

  const isActive = (path) => location.pathname === path;
  const goSoon = (label) => toast.info(t("settings.toast.comingSoon", { label }));

  // ----- Render -----
  return (
    <div className="min-h-screen bg-[#FAF9F6] pb-24" data-testid="wall-board-page">
      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-[#FAF9F6]/95 backdrop-blur-md border-b border-[#EFEBE4]">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="w-10 h-10 -ml-2 rounded-full flex items-center justify-center text-[#2D2A26] active:bg-[#F3F0EA]"
            data-testid="wall-menu-btn"
            aria-label="Menu"
          >
            <Menu className="w-5 h-5" strokeWidth={1.8} />
          </button>
          <div className="flex items-center gap-2">
            <img
              src="/logo192.png"
              alt=""
              className="w-7 h-7 rounded-lg object-cover ring-1 ring-[#E5E2DC]"
            />
            <div className="leading-tight text-center">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#7A7571] font-semibold">My Family</p>
              <p className="text-xs font-heading text-[#2D2A26] -mt-0.5">My Life</p>
            </div>
          </div>
          <div className="flex items-center gap-1 -mr-1">
            <button
              type="button"
              onClick={forceSync}
              className="w-9 h-9 rounded-full flex items-center justify-center text-[#2D2A26] active:bg-[#F3F0EA] relative"
              data-testid="wall-sync-btn"
              aria-label="Sync"
            >
              <RefreshCw className="w-5 h-5" strokeWidth={1.8} />
              {pending > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#E11D48]" />
              )}
            </button>
            <LanguageSwitcher />
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 pt-4">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative rounded-[28px] overflow-hidden h-56 sm:h-64 shadow-[0_18px_50px_-22px_rgba(0,0,0,0.25)]"
          data-testid="wall-hero"
        >
          {settings.hero_photo ? (
            <img
              src={settings.hero_photo}
              alt="Our family"
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#FCE7E9] via-[#F3F0EA] to-[#E0F0FB] flex items-center justify-center">
              <p className="text-xs text-[#7A7571]">{t("hero.tapToAdd")}</p>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
          <button
            type="button"
            onClick={() => setHeroOpen(true)}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/85 backdrop-blur-md flex items-center justify-center text-[#2D2A26] active:scale-95 shadow"
            data-testid="hero-edit-btn"
            aria-label="Edit hero"
          >
            <Pencil className="w-4 h-4" strokeWidth={2} />
          </button>
          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5 text-white">
            <h2 className="font-heading text-xl sm:text-2xl font-semibold tracking-tight flex items-center gap-2">
              {settings.hero_title || t("hero.defaultTitle")}
              <Heart className="w-4 h-4 fill-[#F472B6] text-[#F472B6]" />
            </h2>
            <p className="text-xs sm:text-sm text-white/90 mt-1.5 leading-relaxed">
              {settings.hero_subtitle || t("hero.defaultSubtitle")}
            </p>
          </div>
        </motion.div>

        <div className="mt-5 grid grid-cols-1 gap-3.5">
          {/* Where is my family? (live map) — placed right under the hero. */}
          <FamilyMapCard />

          {/* My Routines entry — opens dedicated page */}
          <RoutinesEntryCard />

          {/* Message of the Day */}
          <SectionCard
            icon={Heart}
            title={settings.message_title || t("section.message")}
            accent="#FCE7E9"
            iconBg="#E11D48"
            onEdit={() => setMsgOpen(true)}
            testid="card-message"
          >
            {settings.message_text ? (
              <div className="bg-white/70 rounded-2xl px-4 py-5 text-center" data-testid="message-content">
                <span className="text-[#E11D48] text-2xl leading-none">“</span>
                <p className="text-sm text-[#3F3A36] leading-relaxed mt-1 whitespace-pre-wrap">
                  {settings.message_text}
                </p>
                <Heart className="w-4 h-4 mx-auto mt-3 fill-[#E11D48] text-[#E11D48]" />
              </div>
            ) : (
              <EmptyState
                text={t("empty.message")}
                onAdd={() => setMsgOpen(true)}
                label={t("empty.message.add")}
              />
            )}
          </SectionCard>

          {/* Photo of the Day */}
          <SectionCard
            icon={ImageIcon}
            title={t("section.photo")}
            accent="#E0F0FB"
            iconBg="#2563EB"
            onAdd={() => photoInputRef.current?.click()}
            addLabel="Add photo"
            testid="card-photo"
          >
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handlePhotoPick}
              data-testid="photo-pick-input"
            />
            {photos.length === 0 ? (
              <EmptyState
                text={t("empty.photos")}
                onAdd={() => photoInputRef.current?.click()}
                label={t("btn.upload")}
              />
            ) : (
              <div className="rounded-2xl overflow-hidden bg-white/70 relative">
                <img
                  src={photos[photoIndex % photos.length].image}
                  alt=""
                  className="w-full h-40 sm:h-44 object-cover"
                  loading="lazy"
                />
                <button
                  type="button"
                  onClick={() => handlePhotoDelete(photos[photoIndex % photos.length].id)}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/85 backdrop-blur flex items-center justify-center text-[#B91C1C] shadow"
                  aria-label="Delete photo"
                  data-testid="photo-delete-btn"
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoIndex((i) => (i - 1 + photos.length) % photos.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/70 backdrop-blur flex items-center justify-center shadow disabled:opacity-0"
                  disabled={photos.length <= 1}
                  aria-label="Previous"
                >
                  <X className="w-4 h-4 rotate-45" />
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoIndex((i) => (i + 1) % photos.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/70 backdrop-blur flex items-center justify-center shadow disabled:opacity-0"
                  disabled={photos.length <= 1}
                  aria-label="Next"
                >
                  <X className="w-4 h-4 -rotate-45" />
                </button>
              </div>
            )}
            {photos.length > 1 && (
              <div className="flex items-center justify-center gap-1.5 mt-2.5">
                {photos.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPhotoIndex(i)}
                    className={`h-1.5 rounded-full transition-all ${
                      i === photoIndex % photos.length ? "w-5 bg-[#2563EB]" : "w-1.5 bg-[#2563EB]/30"
                    }`}
                    aria-label={`Photo ${i + 1}`}
                  />
                ))}
              </div>
            )}
          </SectionCard>

          {/* Our Goals */}
          <SectionCard
            icon={Target}
            title={t("section.goals")}
            accent="#E3F1E0"
            iconBg="#16A34A"
            onAdd={() => setGoalEditor({ open: true, item: null })}
            testid="card-goals"
          >
            {goals.filter((g) => !g.archived_at).length === 0 ? (
              <EmptyState
                text={t("empty.goals")}
                onAdd={() => setGoalEditor({ open: true, item: null })}
                label={t("empty.goals.add")}
              />
            ) : (
              <ul className="bg-white/70 rounded-2xl divide-y divide-[#EFEBE4] overflow-hidden">
                {goals
                  .filter((g) => !g.archived_at)
                  .map((g) => (
                    <li
                      key={g.id}
                      className="flex items-start gap-3 px-3.5 py-2.5"
                      data-testid={`goal-row-${g.id}`}
                    >
                      <button
                        type="button"
                        onClick={() => goalsCrud.update(g.id, { done: !g.done })}
                        className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors flex-shrink-0 mt-0.5 ${
                          g.done ? "bg-[#16A34A]" : "border-2 border-[#E5E2DC] bg-white"
                        }`}
                        aria-label="Toggle"
                        data-testid={`goal-toggle-${g.id}`}
                      >
                        {g.done && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                      </button>
                      <span
                        className={`flex-1 min-w-0 text-sm break-words whitespace-pre-wrap py-0.5 ${
                          g.done ? "text-[#3F3A36] line-through opacity-70" : "text-[#3F3A36]"
                        }`}
                        data-testid={`goal-label-${g.id}`}
                      >
                        {g.label}
                      </span>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => setGoalEditor({ open: true, item: g })}
                          className="w-7 h-7 rounded-full hover:bg-[#F3F0EA] flex items-center justify-center text-[#7A7571]"
                          aria-label="Edit goal"
                          data-testid={`goal-edit-${g.id}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => goalsCrud.update(g.id, { archived: true })}
                          className="w-7 h-7 rounded-full hover:bg-[#FEF3C7] flex items-center justify-center text-[#92400E]"
                          aria-label="Archive goal"
                          data-testid={`goal-archive-${g.id}`}
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => goalsCrud.remove(g.id)}
                          className="w-7 h-7 rounded-full hover:bg-[#FEE2E2] flex items-center justify-center text-[#B91C1C]"
                          aria-label="Delete goal"
                          data-testid={`goal-delete-${g.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            )}

            {/* History button — single button at the bottom of the entire card. */}
            <button
              type="button"
              onClick={() => setGoalHistoryOpen(true)}
              className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-[#16A34A] hover:underline"
              data-testid="goals-history-btn"
            >
              <HistoryIcon className="w-3.5 h-3.5" strokeWidth={2} />
              {t("btn.history")}
            </button>
          </SectionCard>

          {/* Countdown */}
          <SectionCard
            icon={CalendarClock}
            title={t("section.countdown")}
            accent="#FBEED9"
            iconBg="#D97706"
            onAdd={() => setCdEditor({ open: true, item: null })}
            testid="card-countdown"
          >
            {sortedCountdown.length === 0 ? (
              <EmptyState
                text={t("empty.countdown")}
                onAdd={() => setCdEditor({ open: true, item: null })}
                label={t("empty.countdown.add")}
              />
            ) : (
              <ul className="bg-white/70 rounded-2xl divide-y divide-[#EFEBE4]">
                {sortedCountdown.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-3.5 py-3" data-testid={`cd-row-${c.id}`}>
                    <CalendarDays className="w-5 h-5 text-[#D97706]" strokeWidth={1.8} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#3F3A36] truncate">{c.label}</p>
                      <p className="text-[11px] text-[#7A7571]">{formatLongDate(c.date)}</p>
                    </div>
                    <div className="text-right leading-tight">
                      <p className="font-heading text-lg font-bold text-[#D97706]">
                        {c._days !== null ? Math.max(0, c._days) : "—"}
                      </p>
                      <p className="text-[10px] uppercase tracking-wider text-[#7A7571]">days</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCdEditor({ open: true, item: c })}
                      className="w-7 h-7 rounded-full hover:bg-[#F3F0EA] flex items-center justify-center text-[#7A7571]"
                      aria-label="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => cdCrud.remove(c.id)}
                      className="w-7 h-7 rounded-full hover:bg-[#FEE2E2] flex items-center justify-center text-[#B91C1C]"
                      aria-label="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {/* Family Events */}
          <SectionCard
            icon={CalendarHeart}
            title={t("section.familyEvents")}
            accent="#FDE7F1"
            iconBg="#DB2777"
            onAdd={() => setFeEditor({ open: true, item: null })}
            testid="card-family-events"
          >
            {upcomingFamilyEvents.length === 0 ? (
              <EmptyState
                text={t("empty.familyEvents")}
                onAdd={() => setFeEditor({ open: true, item: null })}
                label={t("empty.familyEvents.add")}
              />
            ) : (
              <ul className="bg-white/70 rounded-2xl divide-y divide-[#EFEBE4]">
                {upcomingFamilyEvents.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-3.5 py-3" data-testid={`fe-row-${e.id}`}>
                    <CalendarHeart className="w-5 h-5 text-[#DB2777]" strokeWidth={1.8} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#3F3A36] truncate">{e.title}</p>
                      <p className="text-[11px] text-[#7A7571]">{formatLongDate(e.date)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFeEditor({ open: true, item: e })}
                      className="w-7 h-7 rounded-full hover:bg-[#F3F0EA] flex items-center justify-center text-[#7A7571]"
                      aria-label="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => feCrud.remove(e.id)}
                      className="w-7 h-7 rounded-full hover:bg-[#FEE2E2] flex items-center justify-center text-[#B91C1C]"
                      aria-label="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {/* Quick Notes */}
          <SectionCard
            icon={StickyNote}
            title={t("section.notes")}
            accent="#FBF1D8"
            iconBg="#CA8A04"
            onAdd={() => setNoteEditor({ open: true, item: null })}
            testid="card-notes"
          >
            {notes.length === 0 ? (
              <EmptyState
                text={t("empty.notes")}
                onAdd={() => setNoteEditor({ open: true, item: null })}
                label={t("empty.notes.add")}
              />
            ) : (
              <ul className="bg-white/70 rounded-2xl px-3.5 py-3 space-y-2.5">
                {notes.map((n) => (
                  <li
                    key={n.id}
                    className="flex items-center gap-2.5 text-sm text-[#3F3A36] group"
                    data-testid={`note-row-${n.id}`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: n.color }}
                    />
                    <span className="flex-1 truncate">{n.text}</span>
                    <button
                      type="button"
                      onClick={() => setNoteEditor({ open: true, item: n })}
                      className="w-6 h-6 rounded-full hover:bg-[#F3F0EA] flex items-center justify-center text-[#7A7571] opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Edit"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => notesCrud.remove(n.id)}
                      className="w-6 h-6 rounded-full hover:bg-[#FEE2E2] flex items-center justify-center text-[#B91C1C]"
                      aria-label="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {/* Achievements */}
          <SectionCard
            icon={Trophy}
            title={t("section.achievements")}
            accent="#E6EEF8"
            iconBg="#2563EB"
            onAdd={() => setAchEditor({ open: true, item: null })}
            testid="card-achievements"
          >
            {achievements.length === 0 ? (
              <EmptyState
                text={t("empty.achievements")}
                onAdd={() => setAchEditor({ open: true, item: null })}
                label={t("empty.achievements.add")}
              />
            ) : (
              <div className="flex items-stretch gap-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
                {achievements.map((a) => (
                  <div
                    key={a.id}
                    className="flex flex-col items-center min-w-[88px] snap-start relative group"
                    data-testid={`ach-card-${a.id}`}
                  >
                    <button
                      type="button"
                      onClick={() => achCrud.remove(a.id)}
                      className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-white shadow flex items-center justify-center text-[#B91C1C] opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      aria-label="Delete achievement"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setAchEditor({ open: true, item: a })}
                      className="w-14 h-14 rounded-full overflow-hidden ring-2 ring-white shadow-md flex items-center justify-center bg-gradient-to-br from-[#F472B6] to-[#FBBF24] text-2xl"
                      aria-label="Edit achievement"
                    >
                      {a.image ? (
                        <img src={a.image} alt={a.name} className="w-full h-full object-cover" />
                      ) : (
                        <Trophy className="w-6 h-6 text-white" />
                      )}
                    </button>
                    <p className="text-[11px] font-semibold text-[#3F3A36] mt-1.5 text-center leading-tight">
                      {a.name}
                      <br />
                      <span className="font-normal text-[#7A7571]">{a.note}</span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <p className="text-center text-[10px] text-[#A09B95] tracking-wide mt-6 mb-2">
          {pending > 0 ? t("sync.pendingFooter", { n: pending }) : t("sync.allSynced")}
        </p>
      </div>

      {/* Bottom navigation */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#EFEBE4] shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.08)]"
        data-testid="bottom-nav"
      >
        <div className="max-w-md mx-auto flex items-stretch px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
          <BottomNavItem
            icon={HomeIcon}
            label={t("nav.home")}
            active={isActive("/") || isActive("/wall-board")}
            onClick={() => navigate("/")}
            testid="nav-home"
          />
          <BottomNavItem
            icon={CalendarHeart}
            label={t("nav.timePlan")}
            active={isActive("/time-plan")}
            onClick={() => navigate("/time-plan")}
            testid="nav-time-plan"
          />
          <BottomNavItem
            icon={Wallet}
            label={t("nav.homeBudget")}
            active={false}
            onClick={() => goSoon(t("nav.homeBudget"))}
            testid="nav-home-budget"
          />
          <BottomNavItem
            icon={Heart}
            label={t("nav.wallBoard")}
            active={isActive("/") || isActive("/wall-board")}
            onClick={() => navigate("/")}
            testid="nav-wall-board"
          />
          <BottomNavItem
            icon={SettingsIcon}
            label={t("nav.settings")}
            active={false}
            onClick={() => setSettingsOpen(true)}
            testid="nav-settings"
          />
        </div>
      </nav>

      {/* Editors */}
      <HeroEditor open={heroOpen} onOpenChange={setHeroOpen} settings={settings} onSave={saveSettings} />
      <MessageEditor open={msgOpen} onOpenChange={setMsgOpen} settings={settings} onSave={saveSettings} />
      <GoalEditor
        open={goalEditor.open}
        onOpenChange={(v) => setGoalEditor({ open: v, item: v ? goalEditor.item : null })}
        initial={goalEditor.item}
        onSave={async (payload) => {
          if (goalEditor.item) await goalsCrud.update(goalEditor.item.id, payload);
          else await goalsCrud.create(payload);
          setGoalEditor({ open: false, item: null });
        }}
      />
      <CountdownEditor
        open={cdEditor.open}
        onOpenChange={(v) => setCdEditor({ open: v, item: v ? cdEditor.item : null })}
        initial={cdEditor.item}
        onSave={async (payload) => {
          if (cdEditor.item) await cdCrud.update(cdEditor.item.id, payload);
          else await cdCrud.create(payload);
          setCdEditor({ open: false, item: null });
        }}
      />
      <AchievementEditor
        open={achEditor.open}
        onOpenChange={(v) => setAchEditor({ open: v, item: v ? achEditor.item : null })}
        initial={achEditor.item}
        onSave={async (payload) => {
          if (achEditor.item) await achCrud.update(achEditor.item.id, payload);
          else await achCrud.create(payload);
          setAchEditor({ open: false, item: null });
        }}
      />
      <NoteEditor
        open={noteEditor.open}
        onOpenChange={(v) => setNoteEditor({ open: v, item: v ? noteEditor.item : null })}
        initial={noteEditor.item}
        onSave={async (payload) => {
          if (noteEditor.item) await notesCrud.update(noteEditor.item.id, payload);
          else await notesCrud.create(payload);
          setNoteEditor({ open: false, item: null });
        }}
      />
      <FamilyEventEditor
        open={feEditor.open}
        onOpenChange={(v) => setFeEditor({ open: v, item: v ? feEditor.item : null })}
        initial={feEditor.item}
        onSave={async (payload) => {
          if (feEditor.item) await feCrud.update(feEditor.item.id, payload);
          else await feCrud.create(payload);
          setFeEditor({ open: false, item: null });
        }}
      />
      <WallSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onForceSync={forceSync}
        pendingCount={pending}
      />
      <GoalHistoryDialog
        open={goalHistoryOpen}
        onOpenChange={setGoalHistoryOpen}
        onRestore={async (id) => {
          await goalsCrud.update(id, { archived: false });
          // Bring restored item back into the visible list immediately.
          setGoals((prev) => {
            const exists = prev.some((x) => x.id === id);
            if (exists) {
              return prev.map((x) => (x.id === id ? { ...x, archived_at: null } : x));
            }
            const restored = wallGoals.cachedAll().find((x) => x.id === id);
            return restored ? [...prev, { ...restored, archived_at: null }] : prev;
          });
          toast.success(t("history.restored"));
        }}
        onDelete={async (id) => {
          await goalsCrud.remove(id);
          toast.success(t("history.deleted"));
        }}
      />
    </div>
  );
};

export default WallBoard;
