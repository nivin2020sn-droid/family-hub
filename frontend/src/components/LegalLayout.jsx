// Shared layout for the public legal pages: Privacy Policy, Terms of
// Service, Legal Notice. Renders a consistent hero (icon + title +
// subtitle), breadcrumb navigation, content area, and the cross-link
// footer. Responsive across desktop / tablet / mobile, follows the
// existing warm-cream design language, and respects `prefers-color-scheme: dark`.

import { Link } from "react-router-dom";
import { Home, ChevronRight, Mail } from "lucide-react";

export const LEGAL_LINKS = [
  { to: "/privacy", label: "Privacy Policy", testid: "footer-link-privacy" },
  { to: "/terms-of-service", label: "Terms of Service", testid: "footer-link-tos" },
  { to: "/legal-notice", label: "Legal Notice", testid: "footer-link-legal" },
  { to: "/disclaimer", label: "Disclaimer", testid: "footer-link-disclaimer" },
];

const APP_NAME = "My Life My Time";
const SUPPORT_EMAIL = "info@mylife-mytime.com";

export const LegalFooter = ({ className = "" }) => (
  <footer
    className={`mt-12 border-t border-[#E5E2DC] dark:border-white/10 pt-6 pb-8 ${className}`}
    data-testid="site-footer"
  >
    <div className="max-w-4xl mx-auto px-4 sm:px-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-xs text-[#7A7571] dark:text-white/60">
          © {new Date().getFullYear()} {APP_NAME}. All rights reserved.
        </div>
        <nav
          className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs"
          aria-label="Legal pages"
        >
          {LEGAL_LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="text-[#2D2A26] hover:text-[#E11D48] dark:text-white/80 dark:hover:text-[#F472B6] transition-colors"
              data-testid={l.testid}
            >
              {l.label}
            </Link>
          ))}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-flex items-center gap-1 text-[#7A7571] hover:text-[#2D2A26] dark:text-white/60 dark:hover:text-white transition-colors"
            data-testid="footer-link-email"
          >
            <Mail className="w-3.5 h-3.5" strokeWidth={2} />
            {SUPPORT_EMAIL}
          </a>
        </nav>
      </div>
    </div>
  </footer>
);

export const LegalLayout = ({
  icon: Icon,
  title,
  subtitle,
  lastUpdated,
  children,
  testid,
}) => {
  const today = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());
  return (
    <div
      className="min-h-screen bg-[#F3F0EA] dark:bg-[#15140F] text-[#2D2A26] dark:text-white/90"
      data-testid={testid}
    >
      {/* Top bar — sticky on mobile so the back-to-home button is always reachable. */}
      <div
        className="sticky top-0 z-20 bg-[#F3F0EA]/85 dark:bg-[#15140F]/85 backdrop-blur border-b border-[#E5E2DC] dark:border-white/10"
        data-testid="legal-topbar"
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#2D2A26] dark:text-white/90 hover:text-[#E11D48] transition-colors"
            data-testid="back-to-home"
          >
            <Home className="w-4 h-4" strokeWidth={2} />
            <span>Back to Home</span>
          </Link>
          <div className="text-[10px] uppercase tracking-[0.18em] text-[#7A7571] dark:text-white/50">
            {APP_NAME}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Breadcrumb */}
        <nav
          className="flex items-center gap-1 text-xs text-[#7A7571] dark:text-white/50 mb-6"
          aria-label="Breadcrumb"
          data-testid="breadcrumb"
        >
          <Link to="/" className="hover:text-[#2D2A26] dark:hover:text-white transition-colors">
            Home
          </Link>
          <ChevronRight className="w-3 h-3" strokeWidth={2} />
          <span className="text-[#2D2A26] dark:text-white/80 font-medium">{title}</span>
        </nav>

        {/* Hero */}
        <header className="mb-8 sm:mb-10">
          <div className="flex items-start gap-4">
            {Icon && (
              <div
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#E11D48] flex items-center justify-center text-white flex-shrink-0 shadow-[0_8px_22px_-12px_rgba(225,29,72,0.6)]"
                aria-hidden
              >
                <Icon className="w-6 h-6 sm:w-7 sm:h-7" strokeWidth={2} />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-[#2D2A26] dark:text-white leading-tight">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-2 text-sm sm:text-base text-[#5A5550] dark:text-white/70 leading-relaxed">
                  {subtitle}
                </p>
              )}
              {lastUpdated !== false && (
                <p className="mt-3 text-xs text-[#7A7571] dark:text-white/50">
                  Last Updated:{" "}
                  <time
                    dateTime={new Date().toISOString().slice(0, 10)}
                    data-testid="legal-last-updated"
                  >
                    {today}
                  </time>
                </p>
              )}
            </div>
          </div>
        </header>

        {/* Body */}
        <article
          className="bg-white dark:bg-white/[0.04] rounded-3xl border border-[#E5E2DC] dark:border-white/10 p-5 sm:p-8 lg:p-10 leading-relaxed text-sm sm:text-base text-[#3F3A36] dark:text-white/85 shadow-[0_18px_50px_-32px_rgba(0,0,0,0.18)]"
          data-testid="legal-content"
        >
          {children}
        </article>

        <LegalFooter />
      </div>
    </div>
  );
};

// Tiny content helpers so each page reads like a document, not JSX soup.
export const Section = ({ title, children }) => (
  <section className="mt-6 first:mt-0">
    <h2 className="font-heading text-lg sm:text-xl font-semibold text-[#2D2A26] dark:text-white mb-2">
      {title}
    </h2>
    <div className="space-y-3">{children}</div>
  </section>
);

export const P = ({ children }) => (
  <p className="leading-relaxed">{children}</p>
);

export const Bullets = ({ items }) => (
  <ul className="list-disc ps-5 space-y-1.5 marker:text-[#E11D48]">
    {items.map((it, i) => (
      <li key={i}>{it}</li>
    ))}
  </ul>
);

export const MailLink = ({ email = SUPPORT_EMAIL }) => (
  <a
    href={`mailto:${email}`}
    className="text-[#E11D48] hover:underline font-medium"
  >
    {email}
  </a>
);
