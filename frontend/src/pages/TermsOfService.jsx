// Terms of Service — public route. Mirrors the layout / SEO conventions
// established by PrivacyPolicy.jsx.

import { FileText } from "lucide-react";
import {
  LegalLayout,
  Section,
  P,
  Bullets,
  MailLink,
} from "@/components/LegalLayout";
import { usePageMeta } from "@/lib/usePageMeta";

const TITLE = "Terms of Service";
const DESCRIPTION =
  "The terms that govern your use of My Family My Time — eligibility, accounts, acceptable use, and limitations.";

const TermsOfService = () => {
  usePageMeta({
    title: `${TITLE} · My Family My Time`,
    description: DESCRIPTION,
    ogTitle: `${TITLE} · My Family My Time`,
    ogDescription: DESCRIPTION,
  });

  return (
    <LegalLayout
      icon={FileText}
      title={TITLE}
      subtitle="By accessing or using My Family My Time, you agree to these terms."
      testid="page-terms-of-service"
    >
      <Section title="Acceptance of Terms">
        <P>
          By accessing or using My Family My Time, you agree to these Terms of
          Service.
        </P>
      </Section>

      <Section title="Eligibility">
        <P>
          Users must comply with applicable laws and regulations when using the
          platform.
        </P>
      </Section>

      <Section title="Acceptable Use">
        <P>Users agree not to:</P>
        <Bullets
          items={[
            "Use the platform for unlawful purposes",
            "Attempt unauthorized access",
            "Interfere with system operation",
            "Upload malicious software",
            "Abuse or exploit platform features",
          ]}
        />
      </Section>

      <Section title="Accounts">
        <P>
          Users are responsible for maintaining the confidentiality of their
          accounts and passwords.
        </P>
      </Section>

      <Section title="Service Availability">
        <P>
          The service is provided on an <em>“AS IS”</em> and <em>“AS AVAILABLE”</em>
          {" "}basis.
        </P>
        <P>
          The operator may modify, update, suspend, or discontinue any feature
          at any time without prior notice.
        </P>
      </Section>

      <Section title="Limitation of Liability">
        <P>
          The operator shall not be liable for indirect, incidental, special,
          consequential, or punitive damages arising from the use of the
          platform.
        </P>
      </Section>

      <Section title="Termination">
        <P>
          Accounts may be suspended or terminated in cases of abuse, fraud,
          illegal activity, or violation of these terms.
        </P>
      </Section>

      <Section title="Changes to Terms">
        <P>
          These terms may be updated periodically. Continued use of the
          platform constitutes acceptance of any modifications.
        </P>
      </Section>

      <Section title="Contact">
        <P>
          <MailLink />
        </P>
      </Section>
    </LegalLayout>
  );
};

export default TermsOfService;
