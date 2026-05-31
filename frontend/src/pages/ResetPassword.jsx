import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { KeyRound, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPasswordWithToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { usePageMeta } from "@/lib/usePageMeta";

const ResetPassword = () => {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  usePageMeta({ title: `${t("reset.title")} · My Life My Time` });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (pw.length < 6) {
      setError(t("reset.error.short"));
      return;
    }
    if (pw !== pw2) {
      setError(t("reset.error.mismatch"));
      return;
    }
    if (!token) {
      setError(t("reset.error.invalid"));
      return;
    }
    setBusy(true);
    try {
      await resetPasswordWithToken(token, pw);
      setDone(true);
      setTimeout(() => navigate("/login", { replace: true }), 2500);
    } catch (err) {
      const code = err?.response?.status;
      if (code === 400) {
        setError(t("reset.error.invalid"));
      } else {
        setError(err?.response?.data?.detail || t("reset.error.invalid"));
      }
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center px-4 py-10" data-testid="reset-success-page">
        <div className="w-full max-w-md bg-white rounded-3xl border border-[#E5E2DC] p-8 shadow-sm text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#DCFCE7] flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-[#16A34A]" strokeWidth={2} />
          </div>
          <h1 className="font-heading text-2xl text-[#2D2A26]">{t("reset.success")}</h1>
          <Link to="/login" className="inline-block mt-3 text-sm font-medium text-[#2D2A26] underline" data-testid="reset-success-login">
            {t("forgot.backToLogin")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center px-4 py-10" data-testid="reset-password-page">
      <div className="w-full max-w-md bg-white rounded-3xl border border-[#E5E2DC] p-8 shadow-sm">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#F3F0EA] flex items-center justify-center">
            <KeyRound className="w-7 h-7 text-[#2D2A26]" strokeWidth={2} />
          </div>
          <h1 className="font-heading text-2xl text-[#2D2A26] mt-3">{t("reset.title")}</h1>
          <p className="text-sm text-[#7A7571] mt-1">{t("reset.desc")}</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-[#7A7571]">{t("reset.passwordLabel")}</Label>
            <Input
              type="password"
              autoComplete="new-password"
              required
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder={t("reset.passwordPh")}
              className="rounded-xl border-[#E5E2DC] h-11 mt-1"
              data-testid="reset-password-input"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-[#7A7571]">{t("reset.confirmLabel")}</Label>
            <Input
              type="password"
              autoComplete="new-password"
              required
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              className="rounded-xl border-[#E5E2DC] h-11 mt-1"
              data-testid="reset-password-confirm"
            />
          </div>
          {error && (
            <p className="text-xs text-[#B91C1C]" data-testid="reset-error">{error}</p>
          )}
          <Button
            type="submit"
            disabled={busy || !pw || !pw2}
            className="w-full rounded-2xl bg-[#2D2A26] hover:bg-[#1f1d1a] text-white h-11"
            data-testid="reset-submit-btn"
          >
            {busy ? t("reset.submitting") : t("reset.submit")}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
