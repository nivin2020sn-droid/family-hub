// Disclaimer — public route. Long text comes from /api/site-content.

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { LegalLayout } from "@/components/LegalLayout";
import ContentRenderer from "@/components/ContentRenderer";
import { usePageMeta } from "@/lib/usePageMeta";
import { getSiteContent } from "@/lib/siteContent";

const TITLE = "Disclaimer";
const DESCRIPTION =
  "General disclaimer for the information and services provided by My Life My Time.";

const Disclaimer = () => {
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
      icon={AlertTriangle}
      title={TITLE}
      subtitle="Please read these important notes about the information we provide."
      testid="page-disclaimer"
    >
      {content ? (
        <ContentRenderer text={content.disclaimer} />
      ) : (
        <p className="text-[#7A7571]">Loading…</p>
      )}
    </LegalLayout>
  );
};

export default Disclaimer;
