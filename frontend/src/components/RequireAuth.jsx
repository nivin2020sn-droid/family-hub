import { Navigate, useLocation } from "react-router-dom";
import { isAuthenticated, isAdmin, getAccountToken } from "@/lib/auth";

// Wraps protected routes. Two responsibilities:
//   1. If the device is not unlocked, redirect to /login (and remember target).
//   2. Admin accounts have no family attached, so they must never land on
//      family-facing pages (Wall Board, Budget, Shopping, etc.). Bounce them
//      to the admin console instead.
const RequireAuth = ({ children }) => {
  const location = useLocation();
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (getAccountToken() && isAdmin()) {
    return <Navigate to="/admin" replace />;
  }
  return children;
};

export default RequireAuth;
