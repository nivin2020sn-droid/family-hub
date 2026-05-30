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
import { Shield, RefreshCw, Lock, Unlock, KeyRound, Loader2, LogOut, Copy, Check, UserCog, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import {
  isAdmin, getAccount, getAccountToken,
  adminListFamilies, adminSetFamilyStatus, adminIssueRecovery, adminSetFamilyAccount,
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
                        onClick={() => issueCode(f)}
                        className="rounded-full h-8 text-[11px] gap-1"
                        data-testid={`admin-recovery-${f.id}`}
                      >
                        <KeyRound className="w-3 h-3" />
                        {t("admin.btn.recovery")}
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
    </div>
  );
};

export default Admin;
