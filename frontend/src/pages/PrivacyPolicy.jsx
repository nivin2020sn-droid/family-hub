// Privacy Policy — public route, reachable with or without authentication.
// Content sourced verbatim from the requested specification; the layout
// component handles SEO, Open Graph tags, breadcrumb, and footer.

import { Shield } from "lucide-react";
import {
  LegalLayout,
  Section,
  P,
  Bullets,
  MailLink,
} from "@/components/LegalLayout";
import { usePageMeta } from "@/lib/usePageMeta";

const TITLE = "Privacy Policy";
const DESCRIPTION =
  "Learn how My Life My Time collects, uses, and protects your personal information across all our services.";

const PrivacyPolicy = () => {
  usePageMeta({
    title: `${TITLE} · My Life My Time`,
    description: DESCRIPTION,
    ogTitle: `${TITLE} · My Life My Time`,
    ogDescription: DESCRIPTION,
  });

  return (
    <LegalLayout
      icon={Shield}
      title={TITLE}
      subtitle="Your privacy matters. Here is exactly how we handle your data."
      testid="page-privacy-policy"
    >
      <Section title="Overview">
        <P>
          My Life My Time respects your privacy and is committed to
          protecting your personal information.
        </P>
      </Section>

      <Section title="Information We Collect">
        <Bullets
          items={[
            "Account information such as name, email address and login credentials",
            "Profile information voluntarily provided by users",
            "Family-related information entered by users",
            "Uploaded images and documents",
            "Device and technical information required for service operation",
            "Usage information necessary to improve functionality and security",
          ]}
        />
      </Section>

      <Section title="How We Use Information">
        <Bullets
          items={[
            "To provide and maintain the service",
            "To authenticate users",
            "To synchronize family data",
            "To improve user experience",
            "To provide customer support",
            "To ensure platform security",
            "To prevent abuse and unauthorized access",
          ]}
        />
      </Section>

      <Section title="Data Sharing">
        <P>Personal information is never sold to third parties.</P>
        <P>Information may only be disclosed:</P>
        <Bullets
          items={[
            "When required by law",
            "To protect legal rights",
            "To provide essential technical services required for operation",
          ]}
        />
      </Section>

      <Section title="Data Retention">
        <P>
          Personal data is retained only as long as necessary to operate the
          service, maintain user accounts, fulfill legal obligations, and
          ensure platform security.
        </P>
      </Section>

      <Section title="User Rights">
        <P>
          Users may request access, correction, export, or deletion of their
          personal data by contacting <MailLink />.
        </P>
      </Section>

      <Section title="Security">
        <P>
          Reasonable technical and organizational measures are implemented to
          protect personal information against unauthorized access,
          alteration, disclosure, or destruction.
        </P>
      </Section>

      <Section title="Contact">
        <P>
          For privacy-related inquiries: <MailLink />.
        </P>
      </Section>
    </LegalLayout>
  );
};

export default PrivacyPolicy;
