// Family Members management page — only accessible to family admins.
//
// Permission model mirrors the backend:
//   * `is_family_admin = true` → can add / edit / delete / promote / demote
//     any other member.
//   * Last family admin is protected: cannot be deleted or demoted.
//   * PIN is never readable (bcrypt-hashed server-side); admins can RESET it
//     but never see the original.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, Loader2, UserPlus, Pencil, KeyRound, ShieldCheck, ShieldOff,
  Trash2, Users as UsersIcon, AlertTriangle, Camera, X as XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { MemberAvatar } from "@/components/MemberBadge";
import MemberBadge from "@/components/MemberBadge";
import { fileToAvatarDataUrl } from "@/lib/imageUtils";
import {
  listMembers as apiListMembers,
  addMember as apiAddMember,
  updateMember as apiUpdateMember,
  deleteMember as apiDeleteMember,
  getMember as getCurrentMember,
  hasSelectedMember,
} from "@/lib/auth";

const ROLES = ["parent", "adult", "child", "other"];

const formatError = (err, fallback) => err?.response?.data?.detail || err?.message || fallback;

const FamilyMembers = () => {
  const navigate = useNavigate();
  const { t, dir } = useI18n();
  const currentMember = getCurrentMember();
  const meIsAdmin = !!currentMember?.is_family_admin;

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [add, setAdd] = useState({ name: "", role: "adult", pin: "", is_family_admin: false, avatar: "", busy: false });
  // Edit dialog (name + role + admin toggle, no PIN).
  const [editTarget, setEditTarget] = useState(null);
  const [edit, setEdit] = useState({ name: "", role: "adult", is_family_admin: false, avatar: "", busy: false });
  // Change-PIN dialog (separate so it's deliberate).
  const [pinTarget, setPinTarget] = useState(null);
  const [pinValue, setPinValue] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  // Delete confirmation.
  const [delTarget, setDelTarget] = useState(null);
  const [delBusy, setDelBusy] = useState(false);

  // Guard rail: redirect non-admin members back to the wall board.
  useEffect(() => {
    if (!hasSelectedMember()) {
      navigate("/login", { replace: true });
      return;
    }
    if (!meIsAdmin) {
      toast.error(t("members.notAuthorized"));
      navigate("/", { replace: true });
    }
  }, [meIsAdmin, navigate, t]);

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await apiListMembers();
      setMembers(list);
    } catch (err) {
      toast.error(formatError(err, t("members.error.load")));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const adminCount = members.filter((m) => m.is_family_admin).length;
  const isMe = (m) => currentMember?.id === m.id;
  // Block UI actions that the server would reject anyway, to avoid scary
  // 400 toasts when the last admin tries to remove themselves.
  const canDemote = (m) => m.is_family_admin && adminCount > 1;
  const canDelete = (m) => !(m.is_family_admin && adminCount <= 1);

  const handleAdd = async (e) => {
    e?.preventDefault?.();
    if (add.busy) return;
    if (!add.name.trim()) return toast.error(t("members.error.name"));
    if (add.pin.length < 4) return toast.error(t("members.error.pin"));
    setAdd((s) => ({ ...s, busy: true }));
    try {
      await apiAddMember({
        name: add.name.trim(),
        role: add.role,
        pin: add.pin,
        is_family_admin: add.is_family_admin,
        ...(add.avatar ? { avatar: add.avatar } : {}),
      });
      toast.success(t("members.toast.added", { name: add.name.trim() }));
      setAddOpen(false);
      setAdd({ name: "", role: "adult", pin: "", is_family_admin: false, avatar: "", busy: false });
      await refresh();
    } catch (err) {
      toast.error(formatError(err, t("members.error.add")));
      setAdd((s) => ({ ...s, busy: false }));
    }
  };

  const openEdit = (m) => {
    setEditTarget(m);
    setEdit({
      name: m.name || "",
      role: m.role || "adult",
      is_family_admin: !!m.is_family_admin,
      avatar: m.avatar || "",
      busy: false,
    });
  };

  const saveEdit = async (e) => {
    e?.preventDefault?.();
    if (edit.busy || !editTarget) return;
    setEdit((s) => ({ ...s, busy: true }));
    try {
      const payload = {
        name: edit.name.trim(),
        role: edit.role,
        is_family_admin: edit.is_family_admin,
      };
      // Only include `avatar` when it actually changed; empty string clears.
      if (edit.avatar !== (editTarget.avatar || "")) {
        payload.avatar = edit.avatar;
      }
      await apiUpdateMember(editTarget.id, payload);
      toast.success(t("members.toast.updated"));
      setEditTarget(null);
      await refresh();
    } catch (err) {
      toast.error(formatError(err, t("members.error.update")));
      setEdit((s) => ({ ...s, busy: false }));
    }
  };

  const toggleAdmin = async (m, next) => {
    // Pre-validate the last-admin guard so we don't show a bare 400.
    if (m.is_family_admin && !next && adminCount <= 1) {
      toast.error(t("members.error.lastAdmin"));
      return;
    }
    try {
      await apiUpdateMember(m.id, { is_family_admin: next });
      toast.success(next ? t("members.toast.promoted") : t("members.toast.demoted"));
      await refresh();
    } catch (err) {
      toast.error(formatError(err, t("members.error.update")));
    }
  };

  const savePin = async (e) => {
    e?.preventDefault?.();
    if (pinBusy || !pinTarget) return;
    if (pinValue.length < 4) return toast.error(t("members.error.pin"));
    setPinBusy(true);
    try {
      await apiUpdateMember(pinTarget.id, { pin: pinValue });
      toast.success(t("members.toast.pinChanged", { name: pinTarget.name }));
      setPinTarget(null);
      setPinValue("");
    } catch (err) {
      toast.error(formatError(err, t("members.error.update")));
    } finally {
      setPinBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (delBusy || !delTarget) return;
    setDelBusy(true);
    try {
      await apiDeleteMember(delTarget.id);
      toast.success(t("members.toast.deleted", { name: delTarget.name }));
      setDelTarget(null);
      await refresh();
    } catch (err) {
      toast.error(formatError(err, t("members.error.delete")));
    } finally {
      setDelBusy(false);
    }
  };

  if (!meIsAdmin) {
    return null;
  }

  return (
    <div
      className="min-h-screen bg-[#FAF9F6] pb-12"
      data-testid="family-members-page"
      dir={dir}
    >
      <div className="sticky top-0 z-30 bg-[#FAF9F6]/95 backdrop-blur-md border-b border-[#EFEBE4]">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="w-10 h-10 rounded-full flex items-center justify-center text-[#2D2A26] active:bg-[#F3F0EA]"
            data-testid="members-back-btn"
            aria-label={t("btn.back")}
          >
            <ArrowLeft className="w-5 h-5 rtl:rotate-180" strokeWidth={1.8} />
          </button>
          <div className="flex items-center gap-2 flex-1 justify-center">
            <UsersIcon className="w-5 h-5 text-[#2D2A26]" strokeWidth={1.8} />
            <h1 className="font-heading text-base font-semibold text-[#2D2A26]">
              {t("members.title")}
            </h1>
          </div>
          <LanguageSwitcher />
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 pt-4 space-y-3">
        <div data-testid="family-members-member-strip"><MemberBadge /></div>
        <p className="text-xs text-[#7A7571] leading-relaxed">
          {t("members.desc")}
        </p>

        <Button
          type="button"
          onClick={() => setAddOpen(true)}
          className="w-full h-12 rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white"
          data-testid="members-add-btn"
        >
          <UserPlus className="w-4 h-4 ltr:mr-1.5 rtl:ml-1.5" />
          {t("members.add")}
        </Button>

        <div className="rounded-3xl bg-white border border-[#E5E2DC] overflow-hidden">
          {loading ? (
            <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-[#7A7571]" /></div>
          ) : members.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#7A7571]">{t("members.empty")}</p>
          ) : (
            <ul className="divide-y divide-[#EFEBE4]" data-testid="members-list">
              {members.map((m) => {
                const me = isMe(m);
                return (
                  <li key={m.id} className="px-4 py-3 space-y-2" data-testid={`member-row-${m.id}`}>
                    <div className="flex items-center gap-3">
                      <MemberAvatar member={m} size={40} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[#2D2A26] text-sm">
                          {m.name}
                          {me && <span className="ltr:ml-1 rtl:mr-1 text-[10px] text-[#7C3AED] font-bold uppercase tracking-wider">· {t("members.you")}</span>}
                        </p>
                        <p className="text-[10px] uppercase tracking-wider text-[#7A7571]">
                          {t(`auth.role.${m.role}`)}
                          {m.is_family_admin && <span className="ltr:ml-1 rtl:mr-1 text-emerald-700 font-bold">· {t("members.admin")}</span>}
                        </p>
                      </div>
                      <span className="font-mono text-[#9CA3AF] text-sm tracking-widest">••••</span>
                    </div>

                    {/* Action buttons row */}
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        type="button" size="sm" variant="outline"
                        onClick={() => openEdit(m)}
                        className="rounded-full h-7 text-[10px] gap-1"
                        data-testid={`member-edit-${m.id}`}
                      >
                        <Pencil className="w-3 h-3" />
                        {t("btn.edit")}
                      </Button>
                      <Button
                        type="button" size="sm" variant="outline"
                        onClick={() => { setPinTarget(m); setPinValue(""); }}
                        className="rounded-full h-7 text-[10px] gap-1"
                        data-testid={`member-pin-${m.id}`}
                      >
                        <KeyRound className="w-3 h-3" />
                        {t("members.btn.changePin")}
                      </Button>
                      {m.is_family_admin ? (
                        <Button
                          type="button" size="sm" variant="outline"
                          disabled={!canDemote(m)}
                          onClick={() => toggleAdmin(m, false)}
                          className="rounded-full h-7 text-[10px] gap-1 disabled:opacity-40"
                          data-testid={`member-demote-${m.id}`}
                        >
                          <ShieldOff className="w-3 h-3" />
                          {t("members.btn.removeAdmin")}
                        </Button>
                      ) : (
                        <Button
                          type="button" size="sm" variant="outline"
                          onClick={() => toggleAdmin(m, true)}
                          className="rounded-full h-7 text-[10px] gap-1 text-emerald-700 border-emerald-300"
                          data-testid={`member-promote-${m.id}`}
                        >
                          <ShieldCheck className="w-3 h-3" />
                          {t("members.btn.makeAdmin")}
                        </Button>
                      )}
                      <Button
                        type="button" size="sm" variant="outline"
                        disabled={!canDelete(m)}
                        onClick={() => setDelTarget(m)}
                        className="rounded-full h-7 text-[10px] gap-1 text-rose-700 border-rose-300 hover:bg-rose-50 disabled:opacity-40"
                        data-testid={`member-delete-${m.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                        {t("btn.delete")}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Add member dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm rounded-3xl border border-[#E5E2DC] bg-white" data-testid="members-add-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">{t("members.add")}</DialogTitle>
            <DialogDescription className="text-xs text-[#7A7571]">{t("members.add.desc")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-3">
            <AvatarPicker
              value={add.avatar}
              draft={{ id: "add", name: add.name, color: null }}
              onChange={(v) => setAdd((s) => ({ ...s, avatar: v }))}
            />
            <FieldLabel>{t("auth.field.memberName")}</FieldLabel>
            <Input value={add.name} onChange={(e) => setAdd((s) => ({ ...s, name: e.target.value }))} className="rounded-xl h-11" autoFocus required data-testid="add-name" />
            <FieldLabel>{t("members.role")}</FieldLabel>
            <select value={add.role} onChange={(e) => setAdd((s) => ({ ...s, role: e.target.value }))} className="w-full rounded-xl border border-[#E5E2DC] h-11 px-3 bg-white text-sm" data-testid="add-role">
              {ROLES.map((r) => <option key={r} value={r}>{t(`auth.role.${r}`)}</option>)}
            </select>
            <FieldLabel>{t("auth.field.memberPin")}</FieldLabel>
            <Input
              type="text" inputMode="numeric"
              value={add.pin}
              onChange={(e) => setAdd((s) => ({ ...s, pin: e.target.value.replace(/\D/g, "") }))}
              className="rounded-xl h-11 tracking-widest text-center"
              minLength={4} maxLength={10} required data-testid="add-pin"
            />
            <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-[#E5E2DC] bg-[#FAF9F6] cursor-pointer">
              <input
                type="checkbox" checked={add.is_family_admin}
                onChange={(e) => setAdd((s) => ({ ...s, is_family_admin: e.target.checked }))}
                className="w-4 h-4 accent-[#2D2A26]"
                data-testid="add-isAdmin"
              />
              <span className="text-sm text-[#2D2A26]">{t("members.makeAdmin")}</span>
            </label>
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setAddOpen(false)} disabled={add.busy} className="rounded-full">{t("btn.cancel")}</Button>
              <Button type="submit" disabled={add.busy} className="rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white" data-testid="add-submit">
                {add.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("btn.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(v) => !v && setEditTarget(null)}>
        <DialogContent className="max-w-sm rounded-3xl border border-[#E5E2DC] bg-white" data-testid="members-edit-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">{t("members.edit")}</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <form onSubmit={saveEdit} className="space-y-3">
              <AvatarPicker
                value={edit.avatar}
                draft={{ id: editTarget.id, name: edit.name, color: editTarget.color }}
                onChange={(v) => setEdit((s) => ({ ...s, avatar: v }))}
              />
              <FieldLabel>{t("auth.field.memberName")}</FieldLabel>
              <Input value={edit.name} onChange={(e) => setEdit((s) => ({ ...s, name: e.target.value }))} className="rounded-xl h-11" required data-testid="edit-name" />
              <FieldLabel>{t("members.role")}</FieldLabel>
              <select value={edit.role} onChange={(e) => setEdit((s) => ({ ...s, role: e.target.value }))} className="w-full rounded-xl border border-[#E5E2DC] h-11 px-3 bg-white text-sm" data-testid="edit-role">
                {ROLES.map((r) => <option key={r} value={r}>{t(`auth.role.${r}`)}</option>)}
              </select>
              <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-[#E5E2DC] bg-[#FAF9F6] cursor-pointer">
                <input
                  type="checkbox" checked={edit.is_family_admin}
                  disabled={editTarget.is_family_admin && adminCount <= 1}
                  onChange={(e) => setEdit((s) => ({ ...s, is_family_admin: e.target.checked }))}
                  className="w-4 h-4 accent-[#2D2A26]"
                  data-testid="edit-isAdmin"
                />
                <span className="text-sm text-[#2D2A26]">{t("members.isAdmin")}</span>
              </label>
              {editTarget.is_family_admin && adminCount <= 1 && (
                <p className="text-[10px] text-[#7A7571] flex items-start gap-1">
                  <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  {t("members.lastAdminNote")}
                </p>
              )}
              <DialogFooter className="gap-2">
                <Button type="button" variant="ghost" onClick={() => setEditTarget(null)} disabled={edit.busy} className="rounded-full">{t("btn.cancel")}</Button>
                <Button type="submit" disabled={edit.busy} className="rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white" data-testid="edit-submit">
                  {edit.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("btn.save")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Change PIN dialog */}
      <Dialog open={!!pinTarget} onOpenChange={(v) => !v && setPinTarget(null)}>
        <DialogContent className="max-w-sm rounded-3xl border border-[#E5E2DC] bg-white" data-testid="members-pin-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">{t("members.changePin")}</DialogTitle>
            <DialogDescription className="text-xs text-[#7A7571]">
              {pinTarget && t("members.changePin.desc", { name: pinTarget.name })}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={savePin} className="space-y-3">
            <p className="text-[11px] text-[#7A7571] bg-[#FAF9F6] rounded-xl border border-[#EFEBE4] p-2.5">
              <AlertTriangle className="inline w-3 h-3 ltr:mr-1 rtl:ml-1" />
              {t("members.changePin.note")}
            </p>
            <FieldLabel>{t("members.newPin")}</FieldLabel>
            <Input
              type="text" inputMode="numeric" autoFocus
              value={pinValue}
              onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ""))}
              className="rounded-xl h-11 tracking-widest text-center"
              minLength={4} maxLength={10} required data-testid="pin-input"
            />
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setPinTarget(null)} disabled={pinBusy} className="rounded-full">{t("btn.cancel")}</Button>
              <Button type="submit" disabled={pinBusy || pinValue.length < 4} className="rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white" data-testid="pin-save">
                {pinBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("btn.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!delTarget} onOpenChange={(v) => !v && setDelTarget(null)}>
        <DialogContent className="max-w-sm rounded-3xl border-2 border-rose-300 bg-white" data-testid="members-delete-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              {t("members.delete.title")}
            </DialogTitle>
            <DialogDescription className="text-xs text-rose-900">
              {delTarget && t("members.delete.desc", { name: delTarget.name })}
            </DialogDescription>
          </DialogHeader>
          <p className="text-[11px] text-[#7A7571]">{t("members.delete.note")}</p>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setDelTarget(null)} disabled={delBusy} className="rounded-full">{t("btn.cancel")}</Button>
            <Button type="button" onClick={confirmDelete} disabled={delBusy} className="rounded-full bg-rose-700 hover:bg-rose-800 text-white" data-testid="delete-confirm">
              {delBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <>
                  <Trash2 className="w-4 h-4 ltr:mr-1 rtl:ml-1" />
                  {t("btn.delete")}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const FieldLabel = ({ children }) => (
  <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7A7571] block">
    {children}
  </label>
);

// Inline avatar uploader used inside the Add / Edit dialogs. Keeps the
// preview, file picker, and "remove" action in one neat row.
const AvatarPicker = ({ value, draft, onChange }) => {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const inputId = `avatar-input-${draft?.id || "new"}`;
  const handleFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";  // allow re-uploading the same file
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error(t("members.avatar.tooLarge"));
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      onChange(dataUrl);
    } catch {
      toast.error(t("members.avatar.invalid"));
    } finally {
      setBusy(false);
    }
  };
  const memberLike = { ...draft, avatar: value };
  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl bg-[#FAF9F6] border border-[#E5E2DC]">
      <MemberAvatar member={memberLike} size={56} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-[#2D2A26]">{t("members.avatar.label")}</p>
        <p className="text-[10px] text-[#7A7571] leading-snug">{t("members.avatar.hint")}</p>
        <div className="mt-2 flex items-center gap-2">
          <label
            htmlFor={inputId}
            className="inline-flex items-center gap-1 px-3 h-8 rounded-full bg-[#2D2A26] text-white text-[11px] font-semibold cursor-pointer active:scale-95"
            data-testid="avatar-upload-btn"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
            {t("members.avatar.choose")}
          </label>
          <input
            id={inputId} type="file" accept="image/*" capture="user"
            className="hidden" onChange={handleFile}
            data-testid="avatar-file-input"
          />
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="inline-flex items-center gap-1 px-3 h-8 rounded-full border border-[#E5E2DC] text-[#7A7571] text-[11px] font-semibold hover:bg-white"
              data-testid="avatar-remove-btn"
            >
              <XIcon className="w-3 h-3" />
              {t("members.avatar.remove")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default FamilyMembers;
