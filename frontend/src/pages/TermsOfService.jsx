// Terms of Service — public route. Long text comes from /api/site-content.

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { LegalLayout } from "@/components/LegalLayout";
import ContentRenderer from "@/components/ContentRenderer";
import { usePageMeta } from "@/lib/usePageMeta";
import { getSiteContent } from "@/lib/siteContent";

const TITLE = "Terms of Service";
const DESCRIPTION =
  "The terms that govern your use of My Life My Time — eligibility, accounts, acceptable use, and limitations.";

const TermsOfService = () => {
  const [content, setContent] = useState(null);

  usePageMeta({
    title: `${TITLE} · My Life My Time`,
    description: DESCRIPTION,
    ogTitle: `${TITLE} · My Life My Time`,
    ogDescription: DESCRIPTION,
  });

  useEffect(() => {
    let alive = true;
    getSiteContent().then((d) => {
      if (alive) setContent(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <LegalLayout
      icon={FileText}
      title={TITLE}
      subtitle="By accessing or using My Life My Time, you agree to these terms."
      testid="page-terms-of-service"
    >
      {content ? (
        <ContentRenderer text={content.terms_of_service} />
      ) : (
        <p className="text-[#7A7571]">Loading…</p>
      )}
    </LegalLayout>
  );
};

export default TermsOfService;
