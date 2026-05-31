import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { verifyEmail } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { usePageMeta } from "@/lib/usePageMeta";

/** Landing page consumed by the verification link in the email. */
const VerifyEmail = () => {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const [state, setState] = useState({ status: "loading", email: null });

  usePageMeta({
    title: `${t("verify.success.title")} · My Life My Time`,
    description: t("verify.desc"),
  });

  useEffect(() => {
    if (!token) {
      setState({ status: "fail" });
      return;
    }
    (async () => {
      try {
        const data = await verifyEmail(token);
        setState({ status: "success", email: data?.email || null });
      } catch {
        setState({ status: "fail" });
      }
    })();
  }, [token]);

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center px-4 py-10" data-testid="verify-email-page">
      <div className="w-full max-w-md bg-white rounded-3xl border border-[#E5E2DC] p-8 shadow-sm">
        {state.status === "loading" && (
          <div className="text-center" data-testid="verify-loading">
            <Loader2 className="w-10 h-10 mx-auto text-[#2D2A26] animate-spin" />
            <p className="mt-4 text-sm text-[#7A7571]">…</p>
          </div>
        )}
        {state.status === "success" && (
          <div className="text-center space-y-3" data-testid="verify-success">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[#DCFCE7] flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-[#16A34A]" strokeWidth={2} />
            </div>
            <h1 className="font-heading text-2xl text-[#2D2A26]">{t("verify.success.title")}</h1>
            <p className="text-sm text-[#7A7571]">{t("verify.success.desc")}</p>
            <Button
              onClick={() => navigate("/login")}
              className="rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white gap-2 mt-4"
              data-testid="verify-success-login"
            >
              {t("verify.goToLogin")}
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </Button>
          </div>
        )}
        {state.status === "fail" && (
          <div className="text-center space-y-3" data-testid="verify-fail">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[#FEE2E2] flex items-center justify-center">
              <XCircle className="w-8 h-8 text-[#B91C1C]" strokeWidth={2} />
            </div>
            <h1 className="font-heading text-2xl text-[#7F1D1D]">{t("verify.fail.title")}</h1>
            <p className="text-sm text-[#7A7571]">{t("verify.fail.desc")}</p>
            <Link
              to="/login"
              className="inline-block mt-4 text-sm font-medium text-[#2D2A26] underline underline-offset-2"
              data-testid="verify-fail-login"
            >
              {t("verify.goToLogin")}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default VerifyEmail;
