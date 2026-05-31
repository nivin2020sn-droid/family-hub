import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordEmail } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { usePageMeta } from "@/lib/usePageMeta";

const ForgotPassword = () => {
  const { t, lang } = useI18n();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  usePageMeta({
    title: `${t("forgot.title")} · My Life My Time`,
    description: t("forgot.desc"),
  });

  const submit = async (e) => {
    e.preventDefault();
    if (busy || !email.trim()) return;
    setBusy(true);
    try {
      await forgotPasswordEmail(email.trim().toLowerCase(), lang);
      setSent(true);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center px-4 py-10" data-testid="forgot-password-sent">
        <div className="w-full max-w-md bg-white rounded-3xl border border-[#E5E2DC] p-8 shadow-sm text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#DCFCE7] flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-[#16A34A]" strokeWidth={2} />
          </div>
          <h1 className="font-heading text-2xl text-[#2D2A26]">{t("forgot.sent.title")}</h1>
          <p className="text-sm text-[#7A7571]">{t("forgot.sent.desc", { email })}</p>
          <Link to="/login" className="inline-flex items-center gap-2 mt-4 text-sm font-medium text-[#2D2A26] underline underline-offset-2" data-testid="forgot-back-to-login">
            <ArrowLeft className="w-4 h-4" strokeWidth={2} />
            {t("forgot.backToLogin")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center px-4 py-10" data-testid="forgot-password-page">
      <div className="w-full max-w-md bg-white rounded-3xl border border-[#E5E2DC] p-8 shadow-sm">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#F3F0EA] flex items-center justify-center">
            <Mail className="w-7 h-7 text-[#2D2A26]" strokeWidth={2} />
          </div>
          <h1 className="font-heading text-2xl text-[#2D2A26] mt-3">{t("forgot.title")}</h1>
          <p className="text-sm text-[#7A7571] mt-1">{t("forgot.desc")}</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-[#7A7571]">{t("forgot.emailLabel")}</Label>
            <Input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("forgot.emailPh")}
              className="rounded-xl border-[#E5E2DC] h-11 mt-1"
              data-testid="forgot-email-input"
            />
          </div>
          <Button
            type="submit"
            disabled={busy || !email.trim()}
            className="w-full rounded-2xl bg-[#2D2A26] hover:bg-[#1f1d1a] text-white h-11"
            data-testid="forgot-submit-btn"
          >
            {busy ? t("forgot.sending") : t("forgot.submit")}
          </Button>
        </form>
        <div className="mt-4 text-center">
          <Link to="/login" className="text-xs text-[#7A7571] hover:text-[#2D2A26]" data-testid="forgot-back-login-link">
            {t("forgot.backToLogin")}
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
