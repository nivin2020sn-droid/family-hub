import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { createEvent, updateEvent } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

const DEFAULT_COLOR = "#F472B6";

const EventDialog = ({
  open,
  onOpenChange,
  editing,
  defaultDate,
  defaultUserId,
  users,
  eventTypes,
  canChangeOwner = true,
  currentMemberId,
  onSaved,
}) => {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [userId, setUserId] = useState(defaultUserId || currentMemberId || "");
  const [typeId, setTypeId] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title || "");
      setDate(editing.date || "");
      // Prefer the new field, fall back to legacy `user_id` for older docs.
      setUserId(editing.owner_member_id || editing.user_id || defaultUserId || currentMemberId || "");
      setTypeId(editing.type_id || "");
      setColor(editing.color || DEFAULT_COLOR);
      setStartTime(editing.start_time || "");
      setEndTime(editing.end_time || "");
      setNotes(editing.notes || "");
    } else {
      setTitle("");
      setDate(defaultDate || "");
      setUserId(defaultUserId || currentMemberId || "");
      setTypeId("");
      setColor(DEFAULT_COLOR);
      setStartTime("");
      setEndTime("");
      setNotes("");
    }
  }, [open, editing, defaultDate, defaultUserId, currentMemberId]);

  const handleTypeChange = (id) => {
    setTypeId(id);
    const t = eventTypes.find((x) => x.id === id);
    if (t) setColor(t.color);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !date) {
      toast.error(t("evDlg.titleDateRequired"));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        user_id: userId,
        type_id: typeId || null,
        color,
        date,
        start_time: startTime || null,
        end_time: endTime || null,
        notes: notes.trim(),
      };
      if (editing) {
        await updateEvent(editing.id, payload);
        toast.success(t("evDlg.eventUpdated"));
      } else {
        await createEvent(payload);
        toast.success(t("evDlg.eventCreated"));
      }
      onSaved && onSaved();
    } catch (err) {
      const detail =
        err?.response?.status
          ? `HTTP ${err.response.status}`
          : err?.message || "network error";
      toast.error(t("evDlg.saveFailed", { detail }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md rounded-3xl border border-[#E5E2DC] bg-white p-0 overflow-hidden"
        data-testid="event-dialog"
      >
        <form onSubmit={handleSubmit}>
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="font-heading text-2xl font-medium tracking-tight text-[#2D2A26]">
              {editing ? t("evDlg.editTitle") : t("evDlg.newTitle")}
            </DialogTitle>
            <DialogDescription className="text-sm text-[#7A7571]">
              {editing ? t("evDlg.editDesc") : t("evDlg.newDesc")}
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-4 space-y-4">
            <div>
              <Label htmlFor="ev-title" className="text-xs font-semibold uppercase tracking-wider text-[#7A7571]">
                {t("evDlg.title")}
              </Label>
              <Input
                id="ev-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("evDlg.titlePlaceholder")}
                className="mt-1.5 rounded-xl border-[#E5E2DC] focus-visible:ring-[#2D2A26]"
                data-testid="event-title-input"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-[#7A7571]">{t("evDlg.for")}</Label>
                <Select value={userId} onValueChange={setUserId} disabled={!canChangeOwner}>
                  <SelectTrigger className="mt-1.5 rounded-xl border-[#E5E2DC] disabled:opacity-100 disabled:cursor-not-allowed" data-testid="event-user-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        <span className="inline-flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: u.color }} />
                          {u.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-[#7A7571]">{t("evDlg.category")}</Label>
                <Select value={typeId || "none"} onValueChange={(v) => handleTypeChange(v === "none" ? "" : v)}>
                  <SelectTrigger className="mt-1.5 rounded-xl border-[#E5E2DC]" data-testid="event-type-select">
                    <SelectValue placeholder={t("evDlg.categoryNone")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("evDlg.categoryNoCat")}</SelectItem>
                    {eventTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="inline-flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                          {t.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="ev-date" className="text-xs font-semibold uppercase tracking-wider text-[#7A7571]">
                {t("editor.field.date")}
              </Label>
              <Input
                id="ev-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1.5 rounded-xl border-[#E5E2DC] focus-visible:ring-[#2D2A26]"
                data-testid="event-date-input"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ev-start" className="text-xs font-semibold uppercase tracking-wider text-[#7A7571]">
                  {t("evDlg.startTime")}
                </Label>
                <Input
                  id="ev-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="mt-1.5 rounded-xl border-[#E5E2DC]"
                  data-testid="event-start-input"
                />
              </div>
              <div>
                <Label htmlFor="ev-end" className="text-xs font-semibold uppercase tracking-wider text-[#7A7571]">
                  {t("evDlg.endTime")}
                </Label>
                <Input
                  id="ev-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="mt-1.5 rounded-xl border-[#E5E2DC]"
                  data-testid="event-end-input"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-[#7A7571]">{t("evDlg.color")}</Label>
              <div className="mt-1.5 flex items-center gap-3">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-12 h-10 rounded-xl border border-[#E5E2DC] cursor-pointer bg-white p-1"
                  data-testid="event-color-input"
                />
                <Input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="rounded-xl border-[#E5E2DC] flex-1 font-mono text-sm"
                  data-testid="event-color-hex"
                />
                <div
                  className="w-10 h-10 rounded-xl border border-[#E5E2DC]"
                  style={{ backgroundColor: color }}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="ev-notes" className="text-xs font-semibold uppercase tracking-wider text-[#7A7571]">
                {t("evDlg.notes")}
              </Label>
              <Textarea
                id="ev-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("evDlg.notesPlaceholder")}
                className="mt-1.5 rounded-xl border-[#E5E2DC] focus-visible:ring-[#2D2A26] resize-none"
                rows={3}
                data-testid="event-notes-input"
              />
            </div>
          </div>

          <DialogFooter className="px-6 py-4 bg-[#FAF9F6] border-t border-[#E5E2DC] flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="rounded-full"
              data-testid="event-cancel-btn"
            >
              {t("btn.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white"
              data-testid="event-save-btn"
            >
              {saving ? t("btn.saving") : editing ? t("btn.saveChanges") : t("evDlg.createBtn")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EventDialog;
