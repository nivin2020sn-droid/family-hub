import { useState } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Lock, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { login, isAuthenticated } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showCode, setShowCode] = useState(false);

  if (isAuthenticated()) {
    const target = location.state?.from?.pathname || "/";
    return <Navigate to={target} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await login(code);
      toast.success(t("login.welcomeToast"));
      const target = location.state?.from?.pathname || "/";
      navigate(target, { replace: true });
    } catch (err) {
      toast.error(err.message || "Unable to unlock");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-[#FAF9F6] flex items-center justify-center px-5 py-8 relative"
      data-testid="login-page"
    >
      {/* Language switcher pinned at the top */}
      <div className="absolute top-4 right-4 rtl:right-auto rtl:left-4">
        <LanguageSwitcher variant="full" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm"
      >
        <div className="flex flex-col items-center text-center mb-8">
          <motion.img
            src="/logo512.png"
            alt={t("app.appName")}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="w-28 h-28 sm:w-32 sm:h-32 rounded-[28px] object-cover shadow-[0_20px_50px_-15px_rgba(0,0,0,0.25)] ring-1 ring-[#E5E2DC]"
            data-testid="login-logo"
          />
          <h1 className="font-heading text-2xl sm:text-3xl font-medium tracking-tight text-[#2D2A26] mt-6">
            {t("app.appName")}
          </h1>
          <p className="text-sm text-[#7A7571] mt-2 leading-relaxed max-w-xs">
            {t("login.welcome")}
          </p>
        </div>

        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-white rounded-3xl border border-[#E5E2DC] p-6 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.08)]"
          data-testid="login-form"
        >
          <label
            htmlFor="family-code"
            className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7A7571] flex items-center gap-2 mb-2"
          >
            <KeyRound className="w-3.5 h-3.5" strokeWidth={2} />
            {t("login.familyCode")}
          </label>
          <div className="relative">
            <Input
              id="family-code"
              type={showCode ? "text" : "password"}
              inputMode="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t("login.placeholder")}
              className="rounded-2xl border-[#E5E2DC] focus-visible:ring-[#2D2A26] h-12 text-base pr-16 rtl:pr-3 rtl:pl-16 tracking-widest"
              data-testid="family-code-input"
              disabled={submitting}
            />
            <button
              type="button"
              onClick={() => setShowCode((s) => !s)}
              className="absolute right-3 rtl:right-auto rtl:left-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wider text-[#7A7571] px-2 py-1 rounded-md hover:bg-[#F3F0EA] transition-colors"
              data-testid="toggle-show-code"
              tabIndex={-1}
            >
              {showCode ? t("login.hide") : t("login.show")}
            </button>
          </div>

          <Button
            type="submit"
            disabled={submitting || !code.trim()}
            className="mt-5 w-full h-12 rounded-2xl bg-[#2D2A26] hover:bg-[#1f1d1a] text-white text-base font-medium tracking-wide active:scale-[0.98] transition-transform"
            data-testid="unlock-btn"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 rtl:mr-0 rtl:ml-2 animate-spin" />
                {t("login.unlocking")}
              </>
            ) : (
              <>
                <Lock className="w-4 h-4 mr-2 rtl:mr-0 rtl:ml-2" strokeWidth={2} />
                {t("login.unlock")}
              </>
            )}
          </Button>

          <p className="text-[11px] text-center text-[#A09B95] mt-4 leading-relaxed">
            {t("login.hint")}
          </p>
        </motion.form>

        <p className="text-[11px] text-center text-[#A09B95] mt-6 tracking-wide">
          © {t("app.appName")} · {t("app.tagline")}
        </p>
      </motion.div>
    </div>
  );
};

export default Login;
