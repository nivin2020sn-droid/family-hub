// Multi-step auth screen for My Family My Life.
//
// Flow:
//   1. AccountType  — choose "Family" or "Single" (Single is locked for v1).
//   2. Auth         — switch between Login / Register / Forgot.
//   3. MemberSelect — once an account session exists, pick a member + PIN.
// After member-select succeeds, the user lands on /.

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Lock, Loader2, Users, User as UserIcon, ArrowLeft, Mail, KeyRound,
  ShieldCheck, ChevronRight, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  isAuthenticated,
  hasSelectedMember,
  getAccountToken,
  getAccount,
  getFamily,
  isAdmin,
  login as apiLogin,
  register as apiRegister,
  forgotPassword as apiForgot,
  resetPassword as apiReset,
  selectMember as apiSelectMember,
  listMembers as apiListMembers,
  addMember as apiAddMember,
  logout as apiLogout,
} from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";

const formatError = (err, fallback) => {
  const d = err?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((e) => e?.msg || JSON.stringify(e)).join(" · ");
  if (d?.msg) return d.msg;
  return err?.message || fallback;
};

// ---------- shared shell ----------
const Shell = ({ children, testid }) => (
  <div
    className="min-h-screen bg-[#FAF9F6] flex items-center justify-center px-5 py-8 relative"
    data-testid={testid}
  >
    <div className="absolute top-4 right-4 rtl:right-auto rtl:left-4">
      <LanguageSwitcher variant="full" />
    </div>
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="w-full max-w-sm"
    >
      {children}
    </motion.div>
  </div>
);

const LogoHeader = ({ subtitle }) => {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center text-center mb-6">
      <img
        src="/logo512.png"
        alt={t("app.appName")}
        className="w-20 h-20 rounded-[22px] object-cover shadow-[0_16px_40px_-15px_rgba(0,0,0,0.25)] ring-1 ring-[#E5E2DC]"
      />
      <h1 className="font-heading text-2xl font-medium tracking-tight text-[#2D2A26] mt-4">
        {t("app.appName")}
      </h1>
      {subtitle && (
        <p className="text-xs text-[#7A7571] mt-2 leading-relaxed max-w-xs">
          {subtitle}
        </p>
      )}
    </div>
  );
};

// ---------- screen 1: account type ----------
const AccountTypeScreen = ({ onPick }) => {
  const { t } = useI18n();
  return (
    <Shell testid="account-type-screen">
      <LogoHeader subtitle={t("auth.chooseType.desc")} />
      <div className="space-y-3" data-testid="account-type-options">
        <button
          type="button"
          onClick={() => onPick("family")}
          className="w-full rounded-3xl bg-white border border-[#E5E2DC] p-4 flex items-center gap-3 text-left rtl:text-right active:scale-[0.99] transition shadow-[0_8px_24px_-14px_rgba(0,0,0,0.12)]"
          data-testid="pick-family"
        >
          <div className="w-12 h-12 rounded-2xl bg-[#E11D48] flex items-center justify-center text-white">
            <Users className="w-6 h-6" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-heading text-base font-semibold text-[#2D2A26]">
              {t("auth.type.family")}
            </p>
            <p className="text-[11px] text-[#7A7571] mt-0.5">
              {t("auth.type.familyDesc")}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-[#7A7571] rtl:rotate-180" />
        </button>

        <button
          type="button"
          onClick={() => toast.info(t("auth.type.singleSoon"))}
          className="w-full rounded-3xl bg-white border border-dashed border-[#E5E2DC] p-4 flex items-center gap-3 text-left rtl:text-right opacity-75"
          data-testid="pick-single"
        >
          <div className="w-12 h-12 rounded-2xl bg-[#7A7571] flex items-center justify-center text-white">
            <UserIcon className="w-6 h-6" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-heading text-base font-semibold text-[#2D2A26]">
              {t("auth.type.single")}
            </p>
            <p className="text-[11px] text-[#7A7571] mt-0.5">
              {t("auth.type.comingSoon")}
            </p>
          </div>
        </button>
      </div>
      <p className="text-[11px] text-center text-[#A09B95] mt-6 tracking-wide">
        © {t("app.appName")} · {t("app.tagline")}
      </p>
    </Shell>
  );
};

// ---------- screen 2: login / register / forgot ----------
const AuthScreen = ({ mode, onMode, onBack, onSuccess }) => {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === "register";
  const isForgot = mode === "forgot";

  const submit = async (e) => {
    e?.preventDefault?.();
    if (busy) return;
    setBusy(true);
    try {
      if (isRegister) {
        if (password !== confirm) {
          throw new Error(t("auth.error.passwordMismatch"));
        }
        const data = await apiRegister({
          family_name: familyName.trim(),
          email: email.trim(),
          password,
          confirm_password: confirm,
          recovery_email: recoveryEmail.trim() || null,
        });
        toast.success(t("auth.toast.registered", { name: data.family?.name || familyName }));
        onSuccess("register");
      } else if (isForgot) {
        if (!forgotSent) {
          await apiForgot(email.trim());
          setForgotSent(true);
          toast.success(t("auth.toast.forgotSent"));
        } else {
          await apiReset(resetCode.trim(), password);
          toast.success(t("auth.toast.passwordReset"));
          onMode("login");
          setForgotSent(false);
          setResetCode("");
          setPassword("");
        }
      } else {
        const data = await apiLogin(email.trim(), password);
        toast.success(t("auth.toast.loggedIn"));
        onSuccess("login", data);
      }
    } catch (err) {
      toast.error(formatError(err, t("auth.error.generic")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell testid={`${mode}-screen`}>
      <LogoHeader subtitle={t(`auth.${mode}.subtitle`)} />
      <form
        onSubmit={submit}
        className="bg-white rounded-3xl border border-[#E5E2DC] p-5 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.08)] space-y-3"
        data-testid={`${mode}-form`}
      >
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-[#7A7571] inline-flex items-center gap-1 hover:text-[#2D2A26]"
          data-testid={`${mode}-back-btn`}
        >
          <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" /> {t("btn.back")}
        </button>

        {isRegister && (
          <Field icon={Users} label={t("auth.field.familyName")}>
            <Input
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              className="rounded-xl border-[#E5E2DC] h-11"
              data-testid="register-family-name"
              maxLength={80}
              required
            />
          </Field>
        )}

        {!isForgot || !forgotSent ? (
          <Field icon={Mail} label={t("auth.field.email")}>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl border-[#E5E2DC] h-11"
              data-testid={`${mode}-email`}
              autoComplete="email"
              required
            />
          </Field>
        ) : null}

        {!isForgot && (
          <Field icon={Lock} label={t("auth.field.password")}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-xl border-[#E5E2DC] h-11"
              data-testid={`${mode}-password`}
              autoComplete={isRegister ? "new-password" : "current-password"}
              required
            />
          </Field>
        )}

        {isRegister && (
          <Field icon={ShieldCheck} label={t("auth.field.confirmPassword")}>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="rounded-xl border-[#E5E2DC] h-11"
              data-testid="register-confirm"
              autoComplete="new-password"
              required
            />
          </Field>
        )}

        {isRegister && (
          <Field icon={Mail} label={t("auth.field.recoveryEmail")}>
            <Input
              type="email"
              value={recoveryEmail}
              onChange={(e) => setRecoveryEmail(e.target.value)}
              className="rounded-xl border-[#E5E2DC] h-11"
              data-testid="register-recovery-email"
              placeholder={t("auth.field.optional")}
            />
          </Field>
        )}

        {isForgot && forgotSent && (
          <>
            <Field icon={KeyRound} label={t("auth.field.recoveryCode")}>
              <Input
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value)}
                className="rounded-xl border-[#E5E2DC] h-11 tracking-widest text-center"
                data-testid="forgot-code"
                maxLength={6}
                required
              />
              <p className="text-[10px] text-[#7A7571] mt-1">
                {t("auth.forgot.codeHint")}
              </p>
            </Field>
            <Field icon={Lock} label={t("auth.field.newPassword")}>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-xl border-[#E5E2DC] h-11"
                data-testid="forgot-new-password"
                autoComplete="new-password"
                required
              />
            </Field>
          </>
        )}

        <Button
          type="submit"
          disabled={busy}
          className="w-full h-12 rounded-2xl bg-[#2D2A26] hover:bg-[#1f1d1a] text-white text-base font-medium tracking-wide active:scale-[0.98] transition-transform"
          data-testid={`${mode}-submit`}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t(`auth.${mode}.submit${forgotSent ? "Reset" : ""}`)}
        </Button>

        {/* Mode switchers */}
        <div className="flex items-center justify-between text-[11px] pt-1">
          {mode !== "login" && (
            <button
              type="button"
              onClick={() => { setForgotSent(false); onMode("login"); }}
              className="text-[#2D2A26] font-semibold hover:underline"
              data-testid={`${mode}-go-login`}
            >
              {t("auth.toLogin")}
            </button>
          )}
          {mode !== "register" && (
            <button
              type="button"
              onClick={() => onMode("register")}
              className="text-[#2D2A26] font-semibold hover:underline"
              data-testid={`${mode}-go-register`}
            >
              {t("auth.toRegister")}
            </button>
          )}
          {mode === "login" && (
            <button
              type="button"
              onClick={() => onMode("forgot")}
              className="text-[#7A7571] hover:underline"
              data-testid="login-go-forgot"
            >
              {t("auth.toForgot")}
            </button>
          )}
        </div>
      </form>
    </Shell>
  );
};

const Field = ({ icon: Icon, label, children }) => (
  <div>
    <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7A7571] flex items-center gap-1.5 mb-1">
      {Icon && <Icon className="w-3 h-3" strokeWidth={2} />}
      {label}
    </label>
    {children}
  </div>
);

// ---------- screen 3: member select ----------
const MemberSelectScreen = ({ onAuthExit, onDone }) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const account = getAccount();
  const family = getFamily();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  // Inline "add first member" dialog when the family has none yet.
  const [bootstrap, setBootstrap] = useState({ open: false, name: "", pin: "", role: "parent", busy: false });

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await apiListMembers();
      setMembers(list);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const submitPin = async (e) => {
    e?.preventDefault?.();
    if (!selected || busy) return;
    setBusy(true);
    try {
      await apiSelectMember(selected.id, pin);
      toast.success(t("auth.toast.welcomeMember", { name: selected.name }));
      onDone();
    } catch (err) {
      toast.error(formatError(err, t("auth.error.wrongPin")));
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  const createFirstMember = async (e) => {
    e?.preventDefault?.();
    if (bootstrap.busy) return;
    setBootstrap((s) => ({ ...s, busy: true }));
    try {
      await apiAddMember({ name: bootstrap.name.trim(), role: bootstrap.role, pin: bootstrap.pin.trim() });
      toast.success(t("auth.toast.memberAdded"));
      setBootstrap({ open: false, name: "", pin: "", role: "parent", busy: false });
      await refresh();
    } catch (err) {
      toast.error(formatError(err, t("auth.error.generic")));
      setBootstrap((s) => ({ ...s, busy: false }));
    }
  };

  const signOut = () => {
    apiLogout();
    onAuthExit();
    navigate("/login", { replace: true });
  };

  return (
    <Shell testid="member-select-screen">
      <LogoHeader subtitle={family?.name ? `${family.name}` : ""} />

      {/* Account info / sign out */}
      <div className="flex items-center justify-between text-[11px] text-[#7A7571] mb-3 px-1">
        <span>{account?.email}</span>
        <button
          type="button"
          onClick={signOut}
          className="text-[#B91C1C] font-semibold hover:underline"
          data-testid="member-select-signout"
        >
          {t("btn.signOut")}
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-[#E5E2DC] p-5 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.08)] space-y-3">
        <h2 className="font-heading text-lg font-semibold text-[#2D2A26]">
          {t("auth.who.title")}
        </h2>

        {loading ? (
          <div className="py-8 text-center">
            <Loader2 className="w-5 h-5 animate-spin mx-auto text-[#7A7571]" />
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-6 space-y-3" data-testid="member-select-empty">
            <AlertCircle className="w-8 h-8 text-[#7A7571] mx-auto" />
            <p className="text-sm text-[#5C5853]">{t("auth.who.empty")}</p>
            <Button
              type="button"
              onClick={() => setBootstrap({ open: true, name: "", pin: "", role: "parent", busy: false })}
              className="rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white"
              data-testid="member-bootstrap-btn"
            >
              {t("auth.who.addFirst")}
            </Button>
          </div>
        ) : !selected ? (
          <ul className="space-y-2" data-testid="member-list">
            {members.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => { setSelected(m); setPin(""); }}
                  className="w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl border border-[#EFEBE4] bg-[#FAF9F6] hover:bg-[#F3F0EA] active:scale-[0.99] transition text-left rtl:text-right"
                  data-testid={`member-row-${m.id}`}
                >
                  <div className="w-10 h-10 rounded-full bg-[#E5E2DC] text-[#2D2A26] flex items-center justify-center font-heading font-semibold">
                    {(m.name || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#2D2A26]">{m.name}</p>
                    <p className="text-[10px] uppercase tracking-wider text-[#7A7571]">
                      {t(`auth.role.${m.role}`)}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#7A7571] rtl:rotate-180" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <form onSubmit={submitPin} className="space-y-3" data-testid="member-pin-form">
            <button
              type="button"
              onClick={() => { setSelected(null); setPin(""); }}
              className="text-xs text-[#7A7571] inline-flex items-center gap-1 hover:text-[#2D2A26]"
              data-testid="member-pin-back"
            >
              <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" /> {t("btn.back")}
            </button>
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-[#E5E2DC] mx-auto flex items-center justify-center font-heading text-2xl text-[#2D2A26]">
                {(selected.name || "?").charAt(0).toUpperCase()}
              </div>
              <p className="font-heading text-lg font-semibold text-[#2D2A26] mt-2">
                {selected.name}
              </p>
              <p className="text-[11px] text-[#7A7571]">{t("auth.who.enterPin")}</p>
            </div>
            <Input
              type="password"
              inputMode="numeric"
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              className="rounded-xl border-[#E5E2DC] h-12 text-center tracking-[0.5em] text-lg"
              data-testid="member-pin-input"
              maxLength={10}
              required
            />
            <Button
              type="submit"
              disabled={busy || pin.length < 4}
              className="w-full h-12 rounded-2xl bg-[#2D2A26] hover:bg-[#1f1d1a] text-white text-base font-medium active:scale-[0.98]"
              data-testid="member-pin-submit"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("auth.who.unlock")}
            </Button>
          </form>
        )}
      </div>

      {/* Bootstrap-first-member dialog */}
      {bootstrap.open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={createFirstMember}
            className="w-full max-w-sm bg-white rounded-3xl border border-[#E5E2DC] p-5 space-y-3"
            data-testid="member-bootstrap-dialog"
          >
            <h3 className="font-heading text-lg font-semibold text-[#2D2A26]">
              {t("auth.who.addFirstTitle")}
            </h3>
            <Field icon={UserIcon} label={t("auth.field.memberName")}>
              <Input
                value={bootstrap.name}
                onChange={(e) => setBootstrap((s) => ({ ...s, name: e.target.value }))}
                className="rounded-xl border-[#E5E2DC] h-11"
                data-testid="bootstrap-name"
                required
              />
            </Field>
            <Field icon={KeyRound} label={t("auth.field.memberPin")}>
              <Input
                type="password"
                inputMode="numeric"
                value={bootstrap.pin}
                onChange={(e) => setBootstrap((s) => ({ ...s, pin: e.target.value.replace(/\D/g, "") }))}
                className="rounded-xl border-[#E5E2DC] h-11 tracking-widest text-center"
                data-testid="bootstrap-pin"
                maxLength={10}
                minLength={4}
                required
              />
              <p className="text-[10px] text-[#7A7571] mt-1">
                {t("auth.field.pinHint")}
              </p>
            </Field>
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setBootstrap({ open: false, name: "", pin: "", role: "parent", busy: false })}
                className="rounded-full"
                disabled={bootstrap.busy}
              >
                {t("btn.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={bootstrap.busy || bootstrap.name.length < 1 || bootstrap.pin.length < 4}
                className="rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white"
                data-testid="bootstrap-submit"
              >
                {bootstrap.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("btn.save")}
              </Button>
            </div>
          </form>
        </div>
      )}
    </Shell>
  );
};

// ---------- main page state machine ----------
const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Hooks must be declared unconditionally — early returns below.
  const hasAccountOnly = !!getAccountToken() && !hasSelectedMember();
  const [stage, setStage] = useState(hasAccountOnly ? "member" : "type");
  const [authMode, setAuthMode] = useState("login"); // login | register | forgot

  // Admins never see the family flow — they belong to no family. As soon as
  // we detect an admin token in storage, jump straight to the admin console.
  if (getAccountToken() && isAdmin()) {
    return <Navigate to="/admin" replace />;
  }

  const fullyAuthed = isAuthenticated() && hasSelectedMember();
  if (fullyAuthed) {
    const target = location.state?.from?.pathname || "/";
    return <Navigate to={target} replace />;
  }

  // Right after a successful login/register we may now have an admin token —
  // skip the member-select stage and go directly to /admin.
  const handleAuthSuccess = () => {
    if (isAdmin()) {
      navigate("/admin", { replace: true });
      return;
    }
    setStage("member");
  };
  const handleDone = () => {
    const target = location.state?.from?.pathname || "/";
    navigate(target, { replace: true });
  };

  if (stage === "type") {
    return (
      <AccountTypeScreen
        onPick={() => {
          setAuthMode("login");
          setStage("auth");
        }}
      />
    );
  }
  if (stage === "auth") {
    return (
      <AuthScreen
        mode={authMode}
        onMode={setAuthMode}
        onBack={() => setStage("type")}
        onSuccess={handleAuthSuccess}
      />
    );
  }
  return (
    <MemberSelectScreen
      onAuthExit={() => setStage("type")}
      onDone={handleDone}
    />
  );
};

export default Login;
