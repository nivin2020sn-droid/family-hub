// Read-only Terms & Privacy page reachable from the Wall Board settings.
// Renders the SAME content as the registration gate so the user can review
// the agreements they accepted at sign-up.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BetaTerms from "@/components/BetaTerms";

const Terms = () => {
  const navigate = useNavigate();
  const [version, setVersion] = useState("");
  useEffect(() => {
    let alive = true;
    fetch(`${process.env.REACT_APP_BACKEND_URL}/api/auth/app/info`)
      .then((r) => r.json())
      .then((d) => { if (alive) setVersion(d?.version || ""); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return <BetaTerms mode="view" onBack={() => navigate(-1)} appVersion={version} />;
};

export default Terms;
