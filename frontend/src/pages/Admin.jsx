// Admin console — account-level management only.
//
// Admin can:
//   * list registered families with status + members count + emails
//   * toggle status (active / disabled)
//   * issue a one-time recovery code for a forgotten password
//
// Admin can NEVER see budgets, locations, photos, routines or other family
// data. That separation is enforced server-side by the /api/admin/* routes.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, RefreshCw, Lock, Unlock, KeyRound, Loader2, LogOut, Copy, Check, UserCog, Mail, UserPlus, Stethoscope, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import {
  isAdmin, getAccount, getAccountToken,
  adminListFamilies, adminSetFamilyStatus, adminIssueRecovery, adminSetFamilyAccount, adminAddFamilyMember,
  adminFamilyDiagnostic, adminDeleteFamily,
  logout as apiLogout,
} from "@/lib/auth";

const Admin = () => {
  const navigate = useNavigate();
  const { t, dir } = useI18n();
  const [families, setFamilies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(null); // {familyId, code, expires_at}
  const [copied, setCopied] = useState(false);
  // Dialog state for "Set Login Account".
  const [linkDialog, setLinkDialog] = useState({
    open: false,
    family: null,
    email: "",
    password: "",
    recovery_email: "",
    busy: false,
  });
  // Dialog state for "Add Member" (admin seeding into an existing family).
  const [memberDialog, setMemberDialog] = useState({
    open: false,
    family: null,
    name: "",
    role: "parent",
    pin: "",
    busy: false,
  });
  // Diagnostic dialog state.
  const [diag, setDiag] = useState({ open: false, family: null, data: null, busy: false });
  // Delete-family dialog state.
  const [delDialog, setDelDialog] = useState({
    open: false,
    family: null,
    data: null,
    typedName: "",
    busy: false,
  });

  // Guard: only admins. We redirect any other token holder back to /login.
  useEffect(() => {
    if (!getAccountToken() || !isAdmin()) {
      toast.error(t("admin.notAuthorized"));
      navigate("/login", { replace: true });
    }
  }, [navigate, t]);

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await adminListFamilies();
      setFamilies(list);
    } catch (err) {
      toast.error(err?.response?.data?.detail || t("admin.error.list"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const toggleStatus = async (fam) => {
    const next = fam.status === "active" ? "disabled" : "active";
    try {
      await adminSetFamilyStatus(fam.id, next);
      toast.success(next === "active" ? t("admin.toast.enabled") : t("admin.toast.disabled"));
      await refresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || t("admin.error.toggle"));
    }
  };

  const issueCode = async (fam) => {
    try {
      const data = await adminIssueRecovery(fam.id);
      setRecovery({ familyId: fam.id, ...data });
      toast.success(t("admin.toast.codeIssued"));
    } catch (err) {
      toast.error(err?.response?.data?.detail || t("admin.error.recovery"));
    }
  };

  const openLinkDialog = (fam) => {
    setLinkDialog({
      open: true,
      family: fam,
      email: fam.account_email || "",
      password: "",
      recovery_email: fam.recovery_email || "",
      busy: false,
    });
  };

  const saveLinkAccount = async (e) => {
    e?.preventDefault?.();
    if (linkDialog.busy) return;
    if (!linkDialog.family) return;
    if (linkDialog.password.length < 6) {
      toast.error(t("admin.link.error.password"));
      return;
    }
    setLinkDialog((s) => ({ ...s, busy: true }));
    try {
      const res = await adminSetFamilyAccount(linkDialog.family.id, {
        email: linkDialog.email.trim(),
        password: linkDialog.password,
        recovery_email: linkDialog.recovery_email.trim() || null,
      });
      toast.success(
        res.action === "created"
          ? t("admin.link.toast.created")
          : t("admin.link.toast.updated")
      );
      setLinkDialog({ open: false, family: null, email: "", password: "", recovery_email: "", busy: false });
      await refresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || t("admin.link.error.generic"));
      setLinkDialog((s) => ({ ...s, busy: false }));
    }
  };

  const openMemberDialog = (fam) => {
    setMemberDialog({ open: true, family: fam, name: "", role: "parent", pin: "", busy: false });
  };

  const saveMember = async (e) => {
    e?.preventDefault?.();
    if (memberDialog.busy || !memberDialog.family) return;
    if (!memberDialog.name.trim()) {
      toast.error(t("admin.seedMember.error.name"));
      return;
    }
    if (memberDialog.pin.length < 4) {
      toast.error(t("admin.seedMember.error.pin"));
      return;
    }
    setMemberDialog((s) => ({ ...s, busy: true }));
    try {
      await adminAddFamilyMember(memberDialog.family.id, {
        name: memberDialog.name.trim(),
        role: memberDialog.role,
        pin: memberDialog.pin,
      });
      toast.success(t("admin.seedMember.toast.added", { name: memberDialog.name.trim() }));
      // Keep the dialog open and reset name/pin so the admin can quickly add
      // the next member (e.g. Bahaa → Theresa) without re-opening.
      setMemberDialog((s) => ({ ...s, name: "", pin: "", busy: false }));
      await refresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || t("admin.seedMember.error.generic"));
      setMemberDialog((s) => ({ ...s, busy: false }));
    }
  };

  const openDiagnostic = async (fam) => {
    setDiag({ open: true, family: fam, data: null, busy: true });
    try {
      const data = await adminFamilyDiagnostic(fam.id);
      setDiag({ open: true, family: fam, data, busy: false });
    } catch (err) {
      toast.error(err?.response?.data?.detail || t("admin.diag.error"));
      setDiag({ open: false, family: null, data: null, busy: false });
    }
  };

  const openDeleteDialog = async (fam) => {
    setDelDialog({ open: true, family: fam, data: null, typedName: "", busy: false });
    try {
      const data = await adminFamilyDiagnostic(fam.id);
      setDelDialog((s) => ({ ...s, data }));
    } catch (err) {
      // Even without diagnostic data we still allow delete — just show 0 counts.
      console.warn("Diagnostic before delete failed:", err);
    }
  };

  const confirmDelete = async () => {
    if (delDialog.busy || !delDialog.family) return;
    if (delDialog.typedName.trim() !== delDialog.family.name) {
      toast.error(t("admin.delete.error.confirmName"));
      return;
    }
    setDelDialog((s) => ({ ...s, busy: true }));
    try {
      await adminDeleteFamily(delDialog.family.id);
      toast.success(t("admin.delete.toast.done", { name: delDialog.family.name }));
      setDelDialog({ open: false, family: null, data: null, typedName: "", busy: false });
      await refresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || t("admin.delete.error.generic"));
      setDelDialog((s) => ({ ...s, busy: false }));
    }
  };

  const copyCode = async () => {
    if (!recovery?.code) return;
    try {
      await navigator.clipboard.writeText(recovery.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const signOut = () => {
    apiLogout();
    navigate("/login", { replace: true });
  };

  const account = getAccount();

  return (
    <div className="min-h-screen bg-[#FAF9F6] pb-12" dir={dir} data-testid="admin-page">
      <div className="sticky top-0 z-30 bg-[#FAF9F6]/95 backdrop-blur-md border-b border-[#EFEBE4]">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-[#2D2A26] text-white flex items-center justify-center">
              <Shield className="w-4 h-4" strokeWidth={2} />
            </div>
            <div>
              <h1 className="font-heading text-base font-semibold text-[#2D2A26] leading-none">
                {t("admin.title")}
              </h1>
              <p className="text-[10px] text-[#7A7571] mt-0.5">{account?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={refresh}
              className="w-9 h-9 rounded-full flex items-center justify-center text-[#2D2A26] active:bg-[#F3F0EA]"
              data-testid="admin-refresh-btn"
              aria-label={t("btn.refresh")}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <LanguageSwitcher />
            <button
              type="button"
              onClick={signOut}
              className="text-[11px] text-[#B91C1C] font-semibold inline-flex items-center gap-1 px-2 py-1 rounded-full hover:bg-[#FEE2E2]"
              data-testid="admin-signout"
            >
              <LogOut className="w-3 h-3" />
              {t("btn.signOut")}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-3">
        <div className="rounded-3xl bg-white border border-[#E5E2DC] p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="font-heading text-sm font-semibold text-[#2D2A26]">
              {t("admin.families.title")} ({families.length})
            </h2>
          </div>
          {loading ? (
            <div className="py-8 text-center">
              <Loader2 className="w-5 h-5 animate-spin mx-auto text-[#7A7571]" />
            </div>
          ) : families.length === 0 ? (
            <p className="text-sm text-[#7A7571] text-center py-6">
              {t("admin.families.empty")}
            </p>
          ) : (
            <ul className="space-y-2" data-testid="admin-family-list">
              {families.map((f) => (
                <li
                  key={f.id}
                  className="rounded-2xl border border-[#EFEBE4] bg-[#FAF9F6] p-3"
                  data-testid={`admin-family-${f.id}`}
                >
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <p className="font-heading text-sm font-semibold text-[#2D2A26] inline-flex items-center gap-2 flex-wrap">
                        {f.name}
                        <span
                          className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                            f.status === "active"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-rose-100 text-rose-700"
                          }`}
                        >
                          {f.status}
                        </span>
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700">
                          {f.plan}
                        </span>
                      </p>
                      <ul className="mt-1 text-[11px] text-[#5C5853] space-y-0.5">
                        <li><span className="text-[#7A7571]">{t("admin.fields.email")}:</span> {f.account_email || "—"}</li>
                        <li><span className="text-[#7A7571]">{t("admin.fields.recovery")}:</span> {f.recovery_email || "—"}</li>
                        <li><span className="text-[#7A7571]">{t("admin.fields.created")}:</span> {f.created_at?.slice(0, 10)}</li>
                        <li><span className="text-[#7A7571]">{t("admin.fields.freeUntil")}:</span> {f.free_until?.slice(0, 10)}</li>
                        <li><span className="text-[#7A7571]">{t("admin.fields.members")}:</span> {f.members_count}</li>
                      </ul>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant={f.status === "active" ? "outline" : "default"}
                        onClick={() => toggleStatus(f)}
                        className="rounded-full h-8 text-[11px] gap-1"
                        data-testid={`admin-toggle-${f.id}`}
                      >
                        {f.status === "active" ? (
                          <>
                            <Lock className="w-3 h-3" />
                            {t("admin.btn.disable")}
                          </>
                        ) : (
                          <>
                            <Unlock className="w-3 h-3" />
                            {t("admin.btn.enable")}
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openLinkDialog(f)}
                        className="rounded-full h-8 text-[11px] gap-1"
                        data-testid={`admin-link-${f.id}`}
                      >
                        <UserCog className="w-3 h-3" />
                        {t("admin.btn.link")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openMemberDialog(f)}
                        className="rounded-full h-8 text-[11px] gap-1"
                        data-testid={`admin-addmember-${f.id}`}
                      >
                        <UserPlus className="w-3 h-3" />
                        {t("admin.btn.addMember")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => issueCode(f)}
                        className="rounded-full h-8 text-[11px] gap-1"
                        data-testid={`admin-recovery-${f.id}`}
                      >
                        <KeyRound className="w-3 h-3" />
                        {t("admin.btn.recovery")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openDiagnostic(f)}
                        className="rounded-full h-8 text-[11px] gap-1"
                        data-testid={`admin-diag-${f.id}`}
                      >
                        <Stethoscope className="w-3 h-3" />
                        {t("admin.btn.diag")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openDeleteDialog(f)}
                        className="rounded-full h-8 text-[11px] gap-1 text-rose-700 border-rose-300 hover:bg-rose-50"
                        data-testid={`admin-delete-${f.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                        {t("admin.btn.delete")}
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* One-time recovery code dialog */}
      {recovery && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div
            className="w-full max-w-sm bg-white rounded-3xl border border-[#E5E2DC] p-5 space-y-3"
            data-testid="admin-recovery-dialog"
          >
            <div className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-[#7C3AED]" />
              <h3 className="font-heading text-lg font-semibold text-[#2D2A26]">
                {t("admin.recovery.title")}
              </h3>
            </div>
            <p className="text-xs text-[#7A7571] leading-relaxed">
              {t("admin.recovery.desc")}
            </p>
            <div className="rounded-2xl bg-[#F3F0EA] border border-[#E5E2DC] p-4 flex items-center justify-between">
              <span className="font-heading text-2xl tracking-[0.5em] text-[#2D2A26]" data-testid="admin-recovery-code">
                {recovery.code}
              </span>
              <button
                type="button"
                onClick={copyCode}
                className="w-10 h-10 rounded-full bg-white hover:bg-[#E5E2DC] flex items-center justify-center text-[#2D2A26]"
                aria-label={t("admin.recovery.copy")}
                data-testid="admin-recovery-copy"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-700" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-[#7A7571]">
              {t("admin.recovery.expires")}: {recovery.expires_at?.slice(11, 16)} UTC
            </p>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => setRecovery(null)}
                className="rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white"
                data-testid="admin-recovery-close"
              >
                {t("btn.close")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Set Login Account dialog */}
      {linkDialog.open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <form
            onSubmit={saveLinkAccount}
            className="w-full max-w-sm bg-white rounded-3xl border border-[#E5E2DC] p-5 space-y-3"
            data-testid="admin-link-dialog"
          >
            <div className="flex items-center gap-2">
              <UserCog className="w-5 h-5 text-[#2D2A26]" />
              <h3 className="font-heading text-lg font-semibold text-[#2D2A26]">
                {t("admin.link.title")}
              </h3>
            </div>
            <p className="text-xs text-[#7A7571] leading-relaxed">
              {linkDialog.family?.name
                ? t("admin.link.descFor", { name: linkDialog.family.name })
                : t("admin.link.desc")}
            </p>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7A7571] flex items-center gap-1.5 mb-1">
                <Mail className="w-3 h-3" /> {t("auth.field.email")}
              </label>
              <Input
                type="email"
                value={linkDialog.email}
                onChange={(e) => setLinkDialog((s) => ({ ...s, email: e.target.value }))}
                className="rounded-xl border-[#E5E2DC] h-11"
                required
                autoComplete="off"
                data-testid="admin-link-email"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7A7571] flex items-center gap-1.5 mb-1">
                <KeyRound className="w-3 h-3" /> {t("admin.link.tempPassword")}
              </label>
              <Input
                type="text"
                value={linkDialog.password}
                onChange={(e) => setLinkDialog((s) => ({ ...s, password: e.target.value }))}
                className="rounded-xl border-[#E5E2DC] h-11"
                placeholder={t("admin.link.tempPasswordHint")}
                required
                minLength={6}
                autoComplete="off"
                data-testid="admin-link-password"
              />
              <p className="text-[10px] text-[#7A7571] mt-1">
                {t("admin.link.passwordNote")}
              </p>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7A7571] flex items-center gap-1.5 mb-1">
                <Mail className="w-3 h-3" /> {t("auth.field.recoveryEmail")}
              </label>
              <Input
                type="email"
                value={linkDialog.recovery_email}
                onChange={(e) => setLinkDialog((s) => ({ ...s, recovery_email: e.target.value }))}
                className="rounded-xl border-[#E5E2DC] h-11"
                placeholder={t("auth.field.optional")}
                autoComplete="off"
                data-testid="admin-link-recovery"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setLinkDialog({ open: false, family: null, email: "", password: "", recovery_email: "", busy: false })}
                disabled={linkDialog.busy}
                className="rounded-full"
                data-testid="admin-link-cancel"
              >
                {t("btn.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={linkDialog.busy}
                className="rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white"
                data-testid="admin-link-save"
              >
                {linkDialog.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("btn.save")}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Add Member dialog (admin seed) */}
      {memberDialog.open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <form
            onSubmit={saveMember}
            className="w-full max-w-sm bg-white rounded-3xl border border-[#E5E2DC] p-5 space-y-3"
            data-testid="admin-seed-member-dialog"
          >
            <div className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-[#2D2A26]" />
              <h3 className="font-heading text-lg font-semibold text-[#2D2A26]">
                {t("admin.seedMember.title")}
              </h3>
            </div>
            <p className="text-xs text-[#7A7571] leading-relaxed">
              {memberDialog.family?.name
                ? t("admin.seedMember.descFor", { name: memberDialog.family.name })
                : t("admin.seedMember.desc")}
            </p>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7A7571] mb-1 block">
                {t("auth.field.memberName")}
              </label>
              <Input
                value={memberDialog.name}
                onChange={(e) => setMemberDialog((s) => ({ ...s, name: e.target.value }))}
                className="rounded-xl border-[#E5E2DC] h-11"
                placeholder="Bahaa"
                required
                autoFocus
                data-testid="admin-seed-name"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7A7571] mb-1 block">
                {t("budget.field.type")}
              </label>
              <select
                value={memberDialog.role}
                onChange={(e) => setMemberDialog((s) => ({ ...s, role: e.target.value }))}
                className="w-full rounded-xl border border-[#E5E2DC] h-11 px-3 bg-white text-sm"
                data-testid="admin-seed-role"
              >
                <option value="parent">{t("auth.role.parent")}</option>
                <option value="adult">{t("auth.role.adult")}</option>
                <option value="child">{t("auth.role.child")}</option>
                <option value="other">{t("auth.role.other")}</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7A7571] mb-1 block">
                {t("auth.field.memberPin")}
              </label>
              <Input
                type="text"
                inputMode="numeric"
                value={memberDialog.pin}
                onChange={(e) => setMemberDialog((s) => ({ ...s, pin: e.target.value.replace(/\D/g, "") }))}
                className="rounded-xl border-[#E5E2DC] h-11 tracking-widest text-center"
                placeholder="1234"
                minLength={4}
                maxLength={10}
                required
                data-testid="admin-seed-pin"
              />
              <p className="text-[10px] text-[#7A7571] mt-1">
                {t("admin.seedMember.pinNote")}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setMemberDialog({ open: false, family: null, name: "", role: "parent", pin: "", busy: false })}
                disabled={memberDialog.busy}
                className="rounded-full"
                data-testid="admin-seed-cancel"
              >
                {t("btn.close")}
              </Button>
              <Button
                type="submit"
                disabled={memberDialog.busy}
                className="rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white"
                data-testid="admin-seed-save"
              >
                {memberDialog.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("admin.seedMember.add")}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Diagnostic dialog (read-only family report) */}
      {diag.open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div
            className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-white rounded-3xl border border-[#E5E2DC] p-5 space-y-3"
            data-testid="admin-diag-dialog"
          >
            <div className="flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-[#2D2A26]" />
              <h3 className="font-heading text-lg font-semibold text-[#2D2A26]">
                {t("admin.diag.title")}
              </h3>
            </div>
            {diag.busy || !diag.data ? (
              <div className="py-10 text-center">
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-[#7A7571]" />
              </div>
            ) : (
              <>
                <div className="rounded-2xl bg-[#FAF9F6] border border-[#EFEBE4] p-3 space-y-1 text-[11px] font-mono">
                  <p><span className="text-[#7A7571]">{t("admin.diag.familyId")}:</span> <span className="text-[#2D2A26] break-all" data-testid="admin-diag-fid">{diag.data.family.id}</span></p>
                  <p><span className="text-[#7A7571]">{t("admin.diag.familyName")}:</span> <span className="text-[#2D2A26]">{diag.data.family.name}</span></p>
                  <p><span className="text-[#7A7571]">{t("admin.diag.loginEmail")}:</span> <span className="text-[#2D2A26]">{diag.data.account?.login_email || "—"}</span></p>
                  <p><span className="text-[#7A7571]">{t("admin.diag.familyCode")}:</span> <span className="text-[#2D2A26]">{diag.data.family.family_code || "—"}</span></p>
                  <p><span className="text-[#7A7571]">{t("admin.diag.total")}:</span> <span className="text-[#2D2A26] font-bold">{diag.data.total_records}</span></p>
                </div>
                <ul className="space-y-2" data-testid="admin-diag-sections">
                  {diag.data.sections.map((s) => (
                    <li
                      key={s.key}
                      className="rounded-2xl border border-[#EFEBE4] bg-white p-3"
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-heading text-sm font-semibold text-[#2D2A26]">
                          {s.label}
                        </p>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            s.count > 0 ? "bg-emerald-100 text-emerald-700" : "bg-[#F3F0EA] text-[#7A7571]"
                          }`}
                        >
                          {s.count}
                        </span>
                      </div>
                      <ul className="mt-1.5 space-y-0.5">
                        {s.collections.map((c) => (
                          <li
                            key={c.collection}
                            className="text-[11px] flex items-center justify-between"
                          >
                            <span className="font-mono text-[#5C5853]">{c.collection}</span>
                            <span className="text-[#2D2A26]">{c.count}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-[9px] font-mono text-[#9CA3AF] mt-1 break-all">
                        family_id: {diag.data.family.id}
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => setDiag({ open: false, family: null, data: null, busy: false })}
                className="rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white"
                data-testid="admin-diag-close"
              >
                {t("btn.close")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete-family dialog */}
      {delDialog.open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div
            className="w-full max-w-sm bg-white rounded-3xl border-2 border-rose-300 p-5 space-y-3"
            data-testid="admin-delete-dialog"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-700" />
              <h3 className="font-heading text-lg font-semibold text-rose-700">
                {t("admin.delete.title")}
              </h3>
            </div>

            <div className="rounded-2xl bg-rose-50 border border-rose-200 p-3 space-y-1.5">
              <p className="text-xs text-rose-900 font-semibold">
                {t("admin.delete.warning")}
              </p>
              <p className="text-[11px] text-rose-800">
                {t("admin.delete.familyName")}: <span className="font-mono font-bold">{delDialog.family?.name}</span>
              </p>
              {delDialog.data && (
                <p className="text-[11px] text-rose-800">
                  {t("admin.delete.totalRecords")}: <span className="font-bold">{delDialog.data.total_records}</span>
                </p>
              )}
            </div>

            {delDialog.data && (
              <ul className="text-[10px] space-y-0.5 font-mono text-[#5C5853] max-h-32 overflow-y-auto" data-testid="admin-delete-counts">
                {delDialog.data.sections.filter((s) => s.count > 0).map((s) => (
                  <li key={s.key} className="flex justify-between">
                    <span>{s.label}</span>
                    <span className="font-bold">{s.count}</span>
                  </li>
                ))}
              </ul>
            )}

            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7A7571] block mb-1">
                {t("admin.delete.typeName", { name: delDialog.family?.name })}
              </label>
              <Input
                value={delDialog.typedName}
                onChange={(e) => setDelDialog((s) => ({ ...s, typedName: e.target.value }))}
                className="rounded-xl border-rose-200 h-11 font-mono"
                placeholder={delDialog.family?.name}
                autoComplete="off"
                data-testid="admin-delete-typed-name"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDelDialog({ open: false, family: null, data: null, typedName: "", busy: false })}
                disabled={delDialog.busy}
                className="rounded-full"
                data-testid="admin-delete-cancel"
              >
                {t("btn.cancel")}
              </Button>
              <Button
                type="button"
                onClick={confirmDelete}
                disabled={delDialog.busy || delDialog.typedName.trim() !== delDialog.family?.name}
                className="rounded-full bg-rose-700 hover:bg-rose-800 text-white disabled:opacity-40"
                data-testid="admin-delete-confirm"
              >
                {delDialog.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                  <>
                    <Trash2 className="w-4 h-4 ltr:mr-1 rtl:ml-1" />
                    {t("admin.delete.confirm")}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin;
