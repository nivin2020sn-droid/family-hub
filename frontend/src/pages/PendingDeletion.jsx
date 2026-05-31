import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, LogOut, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  cancelAccountDeletion,
  fetchDeletionStatus,
  getAccountToken,
  isAdmin,
  logout as authLogout,
} from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { usePageMeta } from "@/lib/usePageMeta";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const PendingDeletion = () => {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  usePageMeta({
    title: `${t("account.pending.title")} · My Life My Time`,
    description: t("account.pending.desc", { date: "" }).trim(),
  });

  useEffect(() => {
    // Guard: if no account_token, bounce to /login.
    if (!getAccountToken()) {
      navigate("/login", { replace: true });
      return;
    }
    // Admin accounts never sit in this state — bounce to /admin instead.
    if (isAdmin()) {
      navigate("/admin", { replace: true });
      return;
    }
    (async () => {
      try {
        const data = await fetchDeletionStatus();
        setStatus(data);
        if (data?.status !== "deletion_requested") {
          // Not pending anymore (admin restored it externally, or grace
          // expired and was purged) — kick the user back to login so they
          // re-authenticate against the now-active state.
          navigate("/login", { replace: true });
        }
      } catch (e) {
        if (e?.response?.status === 404) {
          // Account was already purged.
          authLogout();
          navigate("/login", { replace: true });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await cancelAccountDeletion();
      toast.success(t("account.pending.cancelled"));
      authLogout();
      navigate("/login", { replace: true });
    } catch {
      toast.error(t("auth.error.generic"));
      setCancelling(false);
    }
  };

  const handleLogout = () => {
    authLogout();
    navigate("/login", { replace: true });
  };

  const scheduled = status?.scheduled_permanent_delete_at;
  const scheduledDate = scheduled ? new Date(scheduled) : null;
  const daysLeft = scheduledDate
    ? Math.max(
        0,
        Math.ceil((scheduledDate.getTime() - Date.now()) / ONE_DAY_MS)
      )
    : null;
  const localeMap = { en: "en-GB", ar: "ar-EG", de: "de-DE" };
  const formattedDate = scheduledDate
    ? scheduledDate.toLocaleDateString(localeMap[lang] || "en-GB", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

  const daysLabel =
    daysLeft === 1
      ? t("account.pending.daysLeft.one")
      : t("account.pending.daysLeft", { n: daysLeft ?? "" });

  return (
    <div
      className="min-h-screen bg-[#FAF9F6] flex items-center justify-center px-4 py-10"
      data-testid="pending-deletion-page"
    >
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl border border-[#E5E2DC] shadow-sm overflow-hidden">
          <div className="bg-[#FEF3F2] px-6 py-6 border-b border-[#FCDCD7] flex items-start gap-3">
            <div className="shrink-0 w-11 h-11 rounded-2xl bg-[#FCA5A5]/40 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-[#B91C1C]" strokeWidth={2} />
            </div>
            <div className="flex-1">
              <h1
                className="font-heading text-xl text-[#7F1D1D] font-semibold leading-tight"
                data-testid="pending-deletion-title"
              >
                {t("account.pending.title")}
              </h1>
              {loading ? (
                <p className="text-sm text-[#7A7571] mt-1">…</p>
              ) : (
                <>
                  <p className="text-sm text-[#7A1B1B]/80 mt-1">
                    {t("account.pending.desc", { date: formattedDate })}
                  </p>
                  {daysLeft !== null && (
                    <span
                      className="inline-block mt-2 text-[11px] font-semibold uppercase tracking-wider bg-white px-2 py-1 rounded-full border border-[#FCDCD7] text-[#B91C1C]"
                      data-testid="pending-deletion-days-left"
                    >
                      {daysLabel}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-[#2D2A26]">
              {t("account.pending.locked")}
            </p>
            <div className="rounded-2xl border border-[#E5E2DC] bg-[#F3F0EA]/40 px-4 py-3 flex items-start gap-2">
              <ShieldCheck className="w-5 h-5 text-[#2D2A26] shrink-0 mt-0.5" strokeWidth={2} />
              <p className="text-xs text-[#7A7571] leading-relaxed">
                {t("account.delete.legalRetention")}
              </p>
            </div>

            <Button
              type="button"
              onClick={handleCancel}
              disabled={cancelling || loading}
              className="w-full rounded-2xl bg-[#2D2A26] hover:bg-[#1f1d1a] text-white h-12 gap-2"
              data-testid="cancel-deletion-btn"
            >
              <RotateCcw className="w-4 h-4" strokeWidth={2} />
              {cancelling
                ? t("account.pending.cancelling")
                : t("account.pending.cancelBtn")}
            </Button>

            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 text-sm text-[#7A7571] hover:text-[#2D2A26] py-2"
              data-testid="pending-deletion-logout-btn"
            >
              <LogOut className="w-4 h-4" strokeWidth={2} />
              {t("account.pending.signOut")}
            </button>
          </div>

          <div className="border-t border-[#E5E2DC] px-6 py-3 text-center">
            <a
              href="mailto:info@mylife-mytime.com"
              className="text-[11px] text-[#7A7571] hover:text-[#2D2A26]"
              data-testid="pending-deletion-help"
            >
              {t("account.pending.helpEmail")}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PendingDeletion;
