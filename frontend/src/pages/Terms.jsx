// Read-only Terms & Privacy page reachable from the Wall Board settings.
// Renders the SAME content as the registration gate so the user can review
// the agreements they accepted at sign-up.
import { useNavigate } from "react-router-dom";
import BetaTerms from "@/components/BetaTerms";
import { useAppInfo } from "@/lib/useAppInfo";

const Terms = () => {
  const navigate = useNavigate();
  const { version } = useAppInfo();
  return <BetaTerms mode="view" onBack={() => navigate(-1)} appVersion={version || ""} />;
};

export default Terms;
