import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Plus,
  Repeat,
  Check,
  Clock,
  Pencil,
  Trash2,
  History as HistoryIcon,
  AlertCircle,
  SlidersHorizontal,
  Bell,
  BellOff,
  Loader2,
  Calendar as CalendarIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useI18n } from "@/lib/i18n";
import {
  listRoutines,
  createRoutine,
  updateRoutine,
  deleteRoutine,
  completeRoutine,
  snoozeRoutine,
  listRoutineLogs,
  statusFor,
  timeRemaining,
  periodMs,
} from "@/lib/routinesApi";

const STATUS_THEME = {
  green: { ring: "#16A34A", soft: "#E3F1E0", text: "#15803D", chip: "bg-emerald-100 text-emerald-700" },
  orange: { ring: "#F59E0B", soft: "#FEF3C7", text: "#B45309", chip: "bg-amber-100 text-amber-700" },
  red: { ring: "#DC2626", soft: "#FEE2E2", text: "#B91C1C", chip: "bg-rose-100 text-rose-700" },
};

function formatRecurrence(r, t) {
  const n = r.recurrence_interval || 1;
  const tod = r.time_of_day ? t("routines.summary.at", { t: r.time_of_day }) : "";
  if (r.recurrence_type === "monthly_weekday") {
    const ord = t(`routines.ordinal.${r.monthly_week}`);
    const wd = t(`routines.weekday.${r.monthly_weekday}`);
    return [t("routines.summary.monthly_weekday", { ord, wd }), tod].filter(Boolean).join(" ");
  }
  const base = t(`routines.summary.${r.recurrence_type}`, { n });
  return [base, tod].filter(Boolean).join(" ");
}

function formatRemaining(rem, t) {
  if (rem.days > 0) {
    return `${t("routines.unit.days", { n: rem.days })} ${t("routines.unit.hours", {
      n: rem.hours,
    })}`;
  }
  if (rem.hours > 0) {
    return `${t("routines.unit.hours", { n: rem.hours })} ${t("routines.unit.minutes", {
      n: rem.minutes,
    })}`;
  }
  if (rem.minutes > 0) {
    return `${t("routines.unit.minutes", { n: rem.minutes })} ${t("routines.unit.seconds", {
      n: rem.seconds,
    })}`;
  }
  return t("routines.unit.seconds", { n: Math.max(0, rem.seconds) });
}

function formatLocale(iso, locale) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(locale || "en-US", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ---------- Routine Card ----------
const RoutineCard = ({ routine, now, t, locale, onComplete, onSnooze, onEdit, onHistory, onDelete }) => {
  const status = statusFor(routine, now);
  const rem = timeRemaining(routine, now);
  const theme = STATUS_THEME[status];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="relative bg-white rounded-3xl border border-[#EFEBE4] overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.03),0_10px_28px_-18px_rgba(0,0,0,0.18)]"
      data-testid={`routine-card-${routine.id}`}
    >
      {/* Status stripe */}
      <span
        aria-hidden
        className="absolute inset-y-3 left-0 w-1.5 rounded-full"
        style={{ backgroundColor: theme.ring }}
      />

      <div className="p-4 pl-5 sm:p-5 sm:pl-6">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: theme.soft, color: theme.text }}
          >
            <Repeat className="w-5 h-5" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-heading text-base font-semibold text-[#2D2A26] leading-tight truncate">
              {routine.title}
            </h3>
            <p className="text-[11px] text-[#7A7571] mt-0.5 leading-snug line-clamp-2">
              {formatRecurrence(routine, t)}
              {routine.description ? ` · ${routine.description}` : ""}
            </p>
          </div>
          <span
            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${theme.chip}`}
            data-testid={`routine-status-${routine.id}`}
          >
            {t(`routines.status.${status}`)}
          </span>
        </div>

        {/* Big countdown */}
        <div className="mt-3.5 rounded-2xl px-3.5 py-3" style={{ backgroundColor: theme.soft }}>
          <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: theme.text }}>
            {rem.overdue ? t("routines.overdueBy") : t("routines.dueIn")}
          </p>
          <p
            className="font-heading text-2xl sm:text-[26px] font-semibold tracking-tight mt-0.5"
            style={{ color: theme.text }}
            data-testid={`routine-countdown-${routine.id}`}
          >
            {formatRemaining(rem, t)}
          </p>
          <div className="mt-1 flex items-center justify-between text-[10px] text-[#7A7571]">
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" strokeWidth={1.8} />
              {t("routines.nextDue")}: {formatLocale(routine.next_due_at, locale)}
            </span>
            {routine.last_done_at ? (
              <span>
                {t("routines.lastDone")}: {formatLocale(routine.last_done_at, locale)}
              </span>
            ) : null}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-3 flex items-center gap-1.5">
          <Button
            type="button"
            onClick={() => onComplete(routine)}
            className="flex-1 h-10 rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white text-xs sm:text-sm font-semibold px-3"
            data-testid={`routine-complete-${routine.id}`}
          >
            <Check className="w-4 h-4 mr-1 rtl:mr-0 rtl:ml-1" />
            {t("routines.complete")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onSnooze(routine)}
            className="h-10 rounded-full border-[#E5E2DC] px-3 text-xs sm:text-sm"
            data-testid={`routine-snooze-${routine.id}`}
          >
            <Clock className="w-4 h-4 mr-1 rtl:mr-0 rtl:ml-1" />
            {t("routines.snooze")}
          </Button>
          <button
            type="button"
            onClick={() => onHistory(routine)}
            className="w-9 h-9 inline-flex items-center justify-center rounded-full text-[#16A34A] bg-[#E3F1E0] hover:bg-[#D1E7CD] transition active:scale-95 flex-shrink-0"
            aria-label={t("routines.history")}
            data-testid={`routine-history-${routine.id}`}
          >
            <HistoryIcon className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => onEdit(routine)}
            className="w-8 h-8 inline-flex items-center justify-center rounded-full text-[#5C5853] hover:bg-[#F3F0EA] transition active:scale-95"
            aria-label={t("routines.edit")}
            data-testid={`routine-edit-${routine.id}`}
          >
            <Pencil className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(routine)}
            className="w-8 h-8 inline-flex items-center justify-center rounded-full text-[#B91C1C]/80 hover:bg-[#FEE2E2] transition active:scale-95"
            aria-label={t("routines.delete")}
            data-testid={`routine-delete-${routine.id}`}
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

// ---------- Editor Dialog ----------
const ORDINALS = [1, 2, 3, 4, -1];
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
const RECUR_TYPES = ["minutes", "hours", "days", "weeks", "months", "monthly_weekday"];

const RoutineEditor = ({ open, onOpenChange, initial, onSave }) => {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [recurType, setRecurType] = useState("days");
  const [recurInterval, setRecurInterval] = useState(1);
  const [monthlyWeek, setMonthlyWeek] = useState(1);
  const [monthlyWeekday, setMonthlyWeekday] = useState(0);
  const [timeOfDay, setTimeOfDay] = useState("");
  const [assignee, setAssignee] = useState("");
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const [notifyBefore, setNotifyBefore] = useState(60);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setTitle(initial.title || "");
      setDescription(initial.description || "");
      setRecurType(initial.recurrence_type || "days");
      setRecurInterval(initial.recurrence_interval || 1);
      setMonthlyWeek(initial.monthly_week ?? 1);
      setMonthlyWeekday(initial.monthly_weekday ?? 0);
      setTimeOfDay(initial.time_of_day || "");
      setAssignee(initial.default_assignee || "");
      setNotifyEnabled(initial.notify_enabled !== false);
      setNotifyBefore(initial.notify_before_minutes ?? 60);
    } else {
      setTitle("");
      setDescription("");
      setRecurType("days");
      setRecurInterval(1);
      setMonthlyWeek(1);
      setMonthlyWeekday(0);
      setTimeOfDay("");
      setAssignee("");
      setNotifyEnabled(true);
      setNotifyBefore(60);
    }
  }, [open, initial]);

  const handleSave = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        recurrence_type: recurType,
        recurrence_interval: Math.max(1, Number(recurInterval) || 1),
        monthly_week: recurType === "monthly_weekday" ? Number(monthlyWeek) : null,
        monthly_weekday: recurType === "monthly_weekday" ? Number(monthlyWeekday) : null,
        time_of_day: timeOfDay || null,
        tz_offset_minutes: -new Date().getTimezoneOffset(),
        default_assignee: assignee.trim(),
        notify_enabled: notifyEnabled,
        notify_before_minutes: Math.max(0, Number(notifyBefore) || 0),
      };
      await onSave(payload);
      onOpenChange(false);
    } catch (err) {
      toast.error(err?.message || t("routines.saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md rounded-3xl border border-[#E5E2DC] bg-white max-h-[92vh] overflow-y-auto"
        data-testid="routine-editor-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-heading text-xl text-[#2D2A26]">
            {initial ? t("routines.edit") : t("routines.add")}
          </DialogTitle>
          <DialogDescription className="text-xs text-[#7A7571]">
            {t("routines.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-[#7A7571]">
              {t("routines.field.title")}
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("routines.field.titlePh")}
              className="mt-1 rounded-xl border-[#E5E2DC]"
              data-testid="routine-title-input"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-[#7A7571]">
              {t("routines.field.description")}
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("routines.field.descriptionPh")}
              className="mt-1 rounded-xl border-[#E5E2DC] min-h-[60px]"
              data-testid="routine-description-input"
            />
          </div>

          <div>
            <Label className="text-[10px] uppercase tracking-wider text-[#7A7571]">
              {t("routines.field.recurrence")}
            </Label>
            <div className="grid grid-cols-3 gap-1.5 mt-1">
              {RECUR_TYPES.map((rt) => (
                <button
                  key={rt}
                  type="button"
                  onClick={() => setRecurType(rt)}
                  className={`text-[11px] font-medium py-2 rounded-xl border transition ${
                    recurType === rt
                      ? "bg-[#2D2A26] text-white border-[#2D2A26]"
                      : "bg-white text-[#5C5853] border-[#E5E2DC] hover:bg-[#F3F0EA]"
                  }`}
                  data-testid={`routine-recur-${rt}`}
                >
                  {t(`routines.recur.${rt}`)}
                </button>
              ))}
            </div>
          </div>

          {recurType !== "monthly_weekday" && (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                value={recurInterval}
                onChange={(e) => setRecurInterval(e.target.value)}
                className="w-24 rounded-xl border-[#E5E2DC]"
                data-testid="routine-interval-input"
              />
              <span className="text-sm text-[#5C5853]">
                {t(`routines.unit.${recurType}.full`)}
              </span>
            </div>
          )}

          {recurType === "monthly_weekday" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-[#7A7571]">
                  {t("routines.field.recurrence")}
                </Label>
                <select
                  value={monthlyWeek}
                  onChange={(e) => setMonthlyWeek(Number(e.target.value))}
                  className="mt-1 w-full h-10 rounded-xl border border-[#E5E2DC] bg-white text-sm px-2"
                  data-testid="routine-monthly-week"
                >
                  {ORDINALS.map((o) => (
                    <option key={o} value={o}>
                      {t(`routines.ordinal.${o}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-[#7A7571]">
                  &nbsp;
                </Label>
                <select
                  value={monthlyWeekday}
                  onChange={(e) => setMonthlyWeekday(Number(e.target.value))}
                  className="mt-1 w-full h-10 rounded-xl border border-[#E5E2DC] bg-white text-sm px-2"
                  data-testid="routine-monthly-weekday"
                >
                  {WEEKDAYS.map((w) => (
                    <option key={w} value={w}>
                      {t(`routines.weekday.${w}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {recurType !== "minutes" && recurType !== "hours" && (
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-[#7A7571]">
                {t("routines.field.timeOfDay")}
              </Label>
              <Input
                type="time"
                value={timeOfDay}
                onChange={(e) => setTimeOfDay(e.target.value)}
                className="mt-1 rounded-xl border-[#E5E2DC]"
                data-testid="routine-time-input"
              />
            </div>
          )}

          <div>
            <Label className="text-[10px] uppercase tracking-wider text-[#7A7571]">
              {t("routines.field.assignee")}
            </Label>
            <Input
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="mt-1 rounded-xl border-[#E5E2DC]"
              data-testid="routine-assignee-input"
            />
          </div>

          <div className="flex items-center justify-between bg-[#FAF9F6] rounded-2xl px-3 py-2.5">
            <div className="flex items-center gap-2">
              {notifyEnabled ? (
                <Bell className="w-4 h-4 text-[#2D2A26]" />
              ) : (
                <BellOff className="w-4 h-4 text-[#A09B95]" />
              )}
              <span className="text-sm text-[#2D2A26]">{t("routines.field.notify")}</span>
            </div>
            <Switch
              checked={notifyEnabled}
              onCheckedChange={setNotifyEnabled}
              data-testid="routine-notify-switch"
            />
          </div>

          {notifyEnabled && (
            <div className="flex items-center gap-2">
              <Label className="text-[10px] uppercase tracking-wider text-[#7A7571] flex-1">
                {t("routines.field.notifyBefore")}
              </Label>
              <Input
                type="number"
                min={0}
                value={notifyBefore}
                onChange={(e) => setNotifyBefore(e.target.value)}
                className="w-24 rounded-xl border-[#E5E2DC]"
                data-testid="routine-notify-before-input"
              />
              <span className="text-xs text-[#5C5853]">{t("routines.unit.minutes.full")}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 mt-2">
          <Button
            variant="ghost"
            className="rounded-full"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            data-testid="routine-editor-cancel"
          >
            {t("btn.cancel")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white"
            data-testid="routine-editor-save"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t("btn.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------- History Dialog ----------
const RoutineHistoryDialog = ({ open, onOpenChange, routine }) => {
  const { t, locale } = useI18n();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !routine) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const data = await listRoutineLogs(routine.id);
      if (!cancelled) {
        setLogs(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, routine]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md rounded-3xl border border-[#E5E2DC] bg-white max-h-[85vh] flex flex-col"
        data-testid="routine-history-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-heading text-xl text-[#2D2A26] flex items-center gap-2">
            <HistoryIcon className="w-5 h-5 text-[#16A34A]" />
            {t("routines.history.title")}
          </DialogTitle>
          <DialogDescription className="text-xs text-[#7A7571]">
            {routine?.title}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-[#7A7571] text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> {t("fmap.history.loading")}
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-[#7A7571] text-center py-6">
              {t("routines.history.empty")}
            </p>
          ) : (
            <ol className="space-y-2 py-2">
              {logs.map((log) => (
                <li
                  key={log.id}
                  className="bg-[#FAF9F6] rounded-2xl px-3 py-2 border border-[#EFEBE4]"
                  data-testid={`routine-log-${log.id}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[#2D2A26]">
                      {formatLocale(log.done_at, locale)}
                    </p>
                    {log.assignee && (
                      <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-white border border-[#E5E2DC] text-[#5C5853]">
                        {log.assignee}
                      </span>
                    )}
                  </div>
                  {log.notes && (
                    <p className="text-xs text-[#5C5853] mt-1 whitespace-pre-wrap leading-relaxed">
                      {log.notes}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            className="rounded-full"
            onClick={() => onOpenChange(false)}
          >
            {t("btn.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Complete dialog (capture notes + assignee) ----------
const CompleteDialog = ({ open, onOpenChange, routine, onConfirm }) => {
  const { t } = useI18n();
  const [notes, setNotes] = useState("");
  const [assignee, setAssignee] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setNotes("");
      setAssignee(routine?.default_assignee || "");
    }
  }, [open, routine]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-3xl border border-[#E5E2DC] bg-white">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg text-[#2D2A26]">
            {routine?.title}
          </DialogTitle>
          <DialogDescription className="text-xs text-[#7A7571]">
            {t("routines.complete")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-[#7A7571]">
              {t("routines.log.assignee")}
            </Label>
            <Input
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="mt-1 rounded-xl border-[#E5E2DC]"
              data-testid="routine-complete-assignee"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-[#7A7571]">
              {t("routines.log.notes")}
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 rounded-xl border-[#E5E2DC] min-h-[60px]"
              data-testid="routine-complete-notes"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            className="rounded-full"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {t("btn.cancel")}
          </Button>
          <Button
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm({ notes: notes.trim(), assignee: assignee.trim() });
                onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
            className="rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white"
            data-testid="routine-complete-confirm"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 mr-1.5 rtl:mr-0 rtl:ml-1.5" />}
            {t("routines.complete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Main Page ----------
const Routines = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [routines, setRoutines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorInitial, setEditorInitial] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRoutine, setHistoryRoutine] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [snoozeTarget, setSnoozeTarget] = useState(null);
  const [completeTarget, setCompleteTarget] = useState(null);
  const [sort, setSort] = useState("nearest"); // nearest | overdue | recent
  const [now, setNow] = useState(Date.now());
  const notifiedRef = useRef({}); // routineId -> ISO of next_due_at we already notified for

  // Tick clock every 1s for live countdowns
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

  // Browser notifications when crossing into the notify window
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    routines.forEach((r) => {
      if (!r.notify_enabled) return;
      const due = new Date(r.next_due_at).getTime();
      const threshold = (Number(r.notify_before_minutes) || 0) * 60_000;
      const triggerAt = due - threshold;
      if (now >= triggerAt && now < due + 60_000) {
        // Don't notify twice for the same cycle
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

  const sorted = useMemo(() => {
    const items = [...routines];
    if (sort === "nearest") {
      items.sort(
        (a, b) => new Date(a.next_due_at).getTime() - new Date(b.next_due_at).getTime()
      );
    } else if (sort === "overdue") {
      items.sort((a, b) => {
        const da = new Date(a.next_due_at).getTime() - now;
        const db = new Date(b.next_due_at).getTime() - now;
        const ao = da <= 0;
        const bo = db <= 0;
        if (ao !== bo) return ao ? -1 : 1;
        return da - db;
      });
    } else {
      items.sort(
        (a, b) =>
          new Date(b.last_done_at || 0).getTime() - new Date(a.last_done_at || 0).getTime()
      );
    }
    return items;
  }, [routines, sort, now]);

  const requestNotifPerm = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {
        /* ignore */
      }
    }
  };

  const handleSave = async (payload) => {
    if (editorInitial) {
      await updateRoutine(editorInitial.id, payload);
      toast.success(t("btn.save"));
    } else {
      await createRoutine(payload);
      toast.success(t("routines.add"));
      requestNotifPerm();
    }
    setEditorInitial(null);
    await refresh();
  };

  const handleComplete = async (body) => {
    if (!completeTarget) return;
    try {
      await completeRoutine(completeTarget.id, body);
      notifiedRef.current[completeTarget.id] = null; // reset for new cycle
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

  const overdueCount = useMemo(
    () => routines.filter((r) => new Date(r.next_due_at).getTime() <= now).length,
    [routines, now]
  );

  const canNotify =
    typeof window !== "undefined" &&
    "Notification" in window &&
    Notification.permission === "default";

  return (
    <div className="min-h-screen bg-[#FAF9F6] pb-20" data-testid="routines-page">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#FAF9F6]/95 backdrop-blur-md border-b border-[#EFEBE4]">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="w-9 h-9 rounded-full bg-white hover:bg-[#F3F0EA] flex items-center justify-center text-[#2D2A26] active:scale-95 transition border border-[#EFEBE4]"
            aria-label={t("btn.close")}
            data-testid="routines-back-btn"
          >
            <ArrowLeft className="w-4 h-4 rtl:rotate-180" strokeWidth={2.2} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-heading text-lg sm:text-xl font-semibold text-[#2D2A26] tracking-tight">
              {t("routines.title")}
            </h1>
            <p className="text-[11px] text-[#7A7571] truncate">{t("routines.subtitle")}</p>
          </div>
          <LanguageSwitcher />
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 pt-4">
        {canNotify && (
          <button
            type="button"
            onClick={requestNotifPerm}
            className="w-full mb-3 text-[11px] font-medium text-[#1D4ED8] bg-[#EAF2FB] rounded-2xl py-2 px-3 hover:bg-[#DBE7F8] transition inline-flex items-center justify-center gap-2"
            data-testid="routines-enable-notif"
          >
            <Bell className="w-3.5 h-3.5" />
            {t("routines.notifyPermission")}
          </button>
        )}

        {/* Toolbar */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 inline-flex items-center gap-1 bg-white rounded-full border border-[#EFEBE4] p-0.5 shadow-sm">
            {["nearest", "overdue", "recent"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSort(s)}
                className={`flex-1 text-[10px] font-semibold uppercase tracking-wider py-1.5 rounded-full transition ${
                  sort === s
                    ? "bg-[#2D2A26] text-white"
                    : "text-[#5C5853] hover:bg-[#F3F0EA]"
                }`}
                data-testid={`routines-sort-${s}`}
              >
                {t(`routines.sort.${s}`)}
              </button>
            ))}
          </div>
          <Button
            type="button"
            onClick={() => {
              setEditorInitial(null);
              setEditorOpen(true);
            }}
            className="h-10 rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white px-3"
            data-testid="routines-add-btn"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
          </Button>
        </div>

        {overdueCount > 0 && (
          <div className="mb-3 rounded-2xl bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-xs text-[#B91C1C] inline-flex items-center gap-2 w-full">
            <AlertCircle className="w-4 h-4" strokeWidth={2} />
            <span className="font-medium">
              {overdueCount} {overdueCount === 1 ? t("routines.status.red") : t("routines.status.red")}
            </span>
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-[#7A7571] text-sm">
            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="bg-white rounded-3xl border border-[#EFEBE4] px-5 py-10 text-center">
            <Repeat className="w-7 h-7 mx-auto text-[#A09B95] mb-2" strokeWidth={1.6} />
            <p className="text-sm text-[#7A7571] leading-relaxed">{t("routines.empty")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((r) => (
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
          </div>
        )}
      </div>

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

      {/* Snooze chooser */}
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
                data-testid={`routine-snooze-${o.m}`}
              >
                {o.label}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
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
            <AlertDialogCancel className="rounded-full" data-testid="routine-delete-cancel">
              {t("btn.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              className="rounded-full bg-[#B91C1C] hover:bg-[#991414] text-white"
              data-testid="routine-delete-confirm"
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

export default Routines;
