// Privacy Policy — public route. The long text is fetched from
// /api/site-content so the admin can edit it via the Content Management
// dashboard without redeploying.

import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { LegalLayout } from "@/components/LegalLayout";
import ContentRenderer from "@/components/ContentRenderer";
import { usePageMeta } from "@/lib/usePageMeta";
import { getSiteContent } from "@/lib/siteContent";

const TITLE = "Privacy Policy";
const DESCRIPTION =
  "Learn how My Life My Time collects, uses, and protects your personal information across all our services.";

const PrivacyPolicy = () => {
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
      icon={Shield}
      title={TITLE}
      subtitle="Your privacy matters. Here is exactly how we handle your data."
      testid="page-privacy-policy"
    >
      {content ? (
        <ContentRenderer text={content.privacy_policy} />
      ) : (
        <p className="text-[#7A7571]" data-testid="legal-loading">
          Loading…
        </p>
      )}
    </LegalLayout>
  );
};

export default PrivacyPolicy;
