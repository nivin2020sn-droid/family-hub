// Legal Notice / Imprint — public route. Required under § 5 TMG for any
// commercial website operated from Germany; the address block follows the
// data supplied by the operator.

import { Scale, MapPin, Mail as MailIcon } from "lucide-react";
import {
  LegalLayout,
  Section,
  P,
  MailLink,
} from "@/components/LegalLayout";
import { usePageMeta } from "@/lib/usePageMeta";

const TITLE = "Legal Notice";
const DESCRIPTION =
  "Operator and contact details for My Life My Time, plus disclaimers regarding accuracy and external links.";

const LegalNotice = () => {
  usePageMeta({
    title: `${TITLE} · My Life My Time`,
    description: DESCRIPTION,
    ogTitle: `${TITLE} · My Life My Time`,
    ogDescription: DESCRIPTION,
  });

  return (
    <LegalLayout
      icon={Scale}
      title={TITLE}
      subtitle="Operator information and disclaimers in accordance with applicable law."
      testid="page-legal-notice"
      lastUpdated={false}
    >
      <Section title="Operator">
        <P>
          <strong className="font-semibold">My Life My Time</strong>
        </P>
        <P>
          <span className="text-[#7A7571] dark:text-white/60 text-xs uppercase tracking-wider">
            Owner
          </span>
          <br />
          Bahaa Nasser
        </P>
        <P>
          <span className="inline-flex items-center gap-1.5 text-[#7A7571] dark:text-white/60 text-xs uppercase tracking-wider">
            <MapPin className="w-3.5 h-3.5" strokeWidth={2} /> Address
          </span>
          <br />
          Kaiserstraße 101
          <br />
          76133 Karlsruhe
          <br />
          Germany
        </P>
        <P>
          <span className="inline-flex items-center gap-1.5 text-[#7A7571] dark:text-white/60 text-xs uppercase tracking-wider">
            <MailIcon className="w-3.5 h-3.5" strokeWidth={2} /> Email
          </span>
          <br />
          <MailLink />
        </P>
      </Section>

      <Section title="Disclaimer">
        <P>
          The information provided on this website and application is for
          general informational purposes only. While every effort is made to
          keep the information accurate and up to date, no warranties are made
          regarding completeness, accuracy, reliability, suitability, or
          availability.
        </P>
      </Section>

      <Section title="External Links">
        <P>
          External links are provided solely for convenience. The operator is
          not responsible for the content of third-party websites.
        </P>
      </Section>
    </LegalLayout>
  );
};

export default LegalNotice;
