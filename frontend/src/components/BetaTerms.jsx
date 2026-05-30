// Beta Terms / Privacy / Disclaimer gate shown right before account creation.
//
// Render modes:
//   * mode="register"  — the three mandatory checkboxes are required; the
//                        "Continue" button enables only when all three are
//                        ticked. Calls onAccept() with the consent payload.
//   * mode="view"      — read-only display for the Settings → Terms link
//                        (no checkboxes, no continue button).

import { useState } from "react";
import { ShieldCheck, Lock, AlertTriangle, FileText, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

const Bullet = ({ children }) => (
  <li className="flex items-start gap-2 leading-relaxed">
    <span className="mt-1.5 w-1 h-1 rounded-full bg-[#2D2A26] shrink-0" aria-hidden />
    <span>{children}</span>
  </li>
);

const Section = ({ icon: Icon, title, intro, bullets, footer, testid }) => (
  <section
    className="rounded-3xl border border-[#E5E2DC] bg-white p-4 sm:p-5 shadow-sm"
    data-testid={testid}
  >
    <div className="flex items-center gap-2 mb-2">
      <span className="w-8 h-8 rounded-full bg-[#FAF9F6] border border-[#E5E2DC] flex items-center justify-center text-[#2D2A26]">
        <Icon className="w-4 h-4" strokeWidth={2} />
      </span>
      <h3 className="font-heading text-base sm:text-lg font-semibold text-[#2D2A26]">{title}</h3>
    </div>
    {intro && <p className="text-xs sm:text-sm text-[#7A7571] leading-relaxed mb-2">{intro}</p>}
    {bullets && bullets.length > 0 && (
      <ul className="text-xs sm:text-sm text-[#2D2A26] space-y-1.5">
        {bullets.map((b, i) => <Bullet key={i}>{b}</Bullet>)}
      </ul>
    )}
    {footer && <p className="mt-3 text-xs sm:text-sm text-[#7A7571] leading-relaxed">{footer}</p>}
  </section>
);

const Checkbox = ({ checked, onToggle, label, testid }) => (
  <label
    className={`flex items-start gap-2.5 rounded-2xl border px-3 py-2.5 cursor-pointer transition-colors ${
      checked ? "border-[#2D2A26] bg-[#FAF9F6]" : "border-[#EFEBE4] hover:bg-[#FAF9F6]"
    }`}
    data-testid={testid}
  >
    <span
      className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
        checked ? "bg-[#2D2A26] border-[#2D2A26] text-white" : "border-[#D1D5DB]"
      }`}
    >
      {checked && <Check className="w-3 h-3" strokeWidth={3} />}
    </span>
    <span className="flex-1 text-xs sm:text-sm leading-snug text-[#2D2A26]">{label}</span>
    <input
      type="checkbox"
      checked={checked}
      onChange={onToggle}
      className="sr-only"
      data-testid={`${testid}-input`}
    />
  </label>
);

const BetaTerms = ({ mode = "register", onBack, onAccept, appVersion }) => {
  const { t } = useI18n();
  const [c1, setC1] = useState(false); // Beta terms
  const [c2, setC2] = useState(false); // Privacy
  const [c3, setC3] = useState(false); // Disclaimer
  const allChecked = c1 && c2 && c3;
  const isView = mode === "view";

  const betaBullets = (t("beta.terms.bullets") || "").split("|").filter(Boolean);
  const privacyBullets = (t("beta.privacy.bullets") || "").split("|").filter(Boolean);
  const disclaimerBullets = (t("beta.disclaimer.bullets") || "").split("|").filter(Boolean);

  return (
    <div className="min-h-screen bg-[#FAF9F6] pb-8" data-testid="beta-terms-screen">
      <div className="sticky top-0 z-30 bg-[#FAF9F6]/95 backdrop-blur-md border-b border-[#EFEBE4]">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between gap-2">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="text-sm text-[#7A7571] hover:text-[#2D2A26] active:opacity-60"
              data-testid="beta-terms-back-btn"
            >
              {t("btn.back")}
            </button>
          ) : <span />}
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold uppercase tracking-[0.18em] ${appVersion ? "" : "opacity-0"}`}
            data-testid="beta-version-chip"
          >
            <ShieldCheck className="w-3 h-3" strokeWidth={2.4} />
            {t("beta.chip", { version: appVersion || "—" })}
          </span>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 pt-5 space-y-3">
        <div className="text-center">
          <h1 className="font-heading text-2xl sm:text-3xl font-light text-[#2D2A26] leading-tight">
            {t("beta.title")}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#7A7571]">{t("beta.subtitle")}</p>
        </div>

        <Section
          testid="beta-notice-section"
          icon={FileText}
          title={t("beta.terms.title")}
          intro={t("beta.terms.intro")}
          bullets={betaBullets}
        />
        <Section
          testid="beta-privacy-section"
          icon={Lock}
          title={t("beta.privacy.title")}
          intro={t("beta.privacy.intro")}
          bullets={privacyBullets}
          footer={t("beta.privacy.footer")}
        />
        <Section
          testid="beta-disclaimer-section"
          icon={AlertTriangle}
          title={t("beta.disclaimer.title")}
          intro={t("beta.disclaimer.intro")}
          bullets={disclaimerBullets}
          footer={t("beta.disclaimer.footer")}
        />

        {!isView && (
          <div className="space-y-2 pt-2" data-testid="beta-consents-block">
            <Checkbox
              checked={c1}
              onToggle={() => setC1((v) => !v)}
              label={t("beta.consent.terms")}
              testid="beta-consent-terms"
            />
            <Checkbox
              checked={c2}
              onToggle={() => setC2((v) => !v)}
              label={t("beta.consent.privacy")}
              testid="beta-consent-privacy"
            />
            <Checkbox
              checked={c3}
              onToggle={() => setC3((v) => !v)}
              label={t("beta.consent.disclaimer")}
              testid="beta-consent-disclaimer"
            />
            <Button
              type="button"
              disabled={!allChecked}
              onClick={() =>
                onAccept &&
                onAccept({
                  accepted_beta_terms: c1,
                  accepted_privacy_policy: c2,
                  accepted_disclaimer: c3,
                })
              }
              className="w-full h-12 rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="beta-continue-btn"
            >
              {t("beta.continue")}
            </Button>
            <p className="text-[10px] text-center text-[#7A7571]">
              {t("beta.continue.hint")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default BetaTerms;
