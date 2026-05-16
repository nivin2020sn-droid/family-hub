import { Navigate, useLocation } from "react-router-dom";
import { isAuthenticated } from "@/lib/auth";

// Wraps protected routes. If the device is not unlocked, redirect to /login
// and remember the page the user was trying to reach.
const RequireAuth = ({ children }) => {
  const location = useLocation();
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
};

export default RequireAuth;
