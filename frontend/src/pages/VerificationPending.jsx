import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, RefreshCw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resendVerification } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";

/** Inline screen shown right after register OR when login returns
 *  email_not_verified. Wired into Login.jsx as a stage, not a top-level
 *  route, so it inherits the existing layout / language switcher. */
const VerificationPending = ({ email, onBack }) => {
  const { t, lang } = useI18n();
  const [busy, setBusy] = useState(false);

  const resend = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await resendVerification(email, lang);
      toast.success(t("verify.resent"));
    } catch (err) {
      const code = err?.response?.status;
      if (code === 429) toast.error(t("verify.rateLimited"));
      else toast.error(t("auth.error.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center px-4 py-10" data-testid="verification-pending-page">
      <div className="w-full max-w-md bg-white rounded-3xl border border-[#E5E2DC] p-8 shadow-sm text-center space-y-3">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-[#F3F0EA] flex items-center justify-center">
          <Mail className="w-7 h-7 text-[#2D2A26]" strokeWidth={2} />
        </div>
        <h1 className="font-heading text-2xl text-[#2D2A26]" data-testid="verification-pending-title">
          {t("verify.title")}
        </h1>
        <p className="text-sm text-[#2D2A26]" data-testid="verification-pending-subtitle">
          {t("verify.subtitle", { email: email || "" })}
        </p>
        <p className="text-xs text-[#7A7571] leading-relaxed">
          {t("verify.desc")}
        </p>
        <p className="text-[11px] text-[#A09B95] leading-relaxed pt-2">
          {t("verify.tipNoEmail")}
        </p>
        <div className="pt-3 space-y-2">
          <Button
            type="button"
            onClick={resend}
            disabled={busy || !email}
            className="w-full rounded-2xl bg-[#2D2A26] hover:bg-[#1f1d1a] text-white h-11 gap-2"
            data-testid="resend-verification-btn"
          >
            <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} strokeWidth={2} />
            {t("verify.resend")}
          </Button>
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="w-full inline-flex items-center justify-center gap-2 text-sm text-[#7A7571] hover:text-[#2D2A26] py-2"
              data-testid="verification-pending-back"
            >
              <ArrowLeft className="w-4 h-4" strokeWidth={2} />
              {t("forgot.backToLogin")}
            </button>
          ) : (
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 text-sm text-[#7A7571] hover:text-[#2D2A26] py-2"
              data-testid="verification-pending-login"
            >
              <ArrowLeft className="w-4 h-4" strokeWidth={2} />
              {t("forgot.backToLogin")}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

export default VerificationPending;
