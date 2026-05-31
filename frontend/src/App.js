import "@/App.css";
// Side-effect import: installs the global axios auth interceptor before
// any page-level code runs, so every backend call carries the JWT.
import axios from "axios";
import { attachAuth } from "@/lib/authInterceptor";
attachAuth(axios);

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import TimePlan from "@/pages/TimePlan";
import WallBoard from "@/pages/WallBoard";
import Routines from "@/pages/Routines";
import HomeBudget from "@/pages/HomeBudget";
import ShoppingList from "@/pages/ShoppingList";
import Admin from "@/pages/Admin";
import FamilyMembers from "@/pages/FamilyMembers";
import MyMoney from "@/pages/MyMoney";
import Terms from "@/pages/Terms";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";
import LegalNotice from "@/pages/LegalNotice";
import Disclaimer from "@/pages/Disclaimer";
import AdminContent from "@/pages/AdminContent";
import Login from "@/pages/Login";
import PendingDeletion from "@/pages/PendingDeletion";
import VerifyEmail from "@/pages/VerifyEmail";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import AdminEmailSettings from "@/pages/AdminEmailSettings";
import { Toaster } from "@/components/ui/sonner";
import ErrorBoundary from "@/components/ErrorBoundary";
import RequireAuth from "@/components/RequireAuth";
import { I18nProvider } from "@/lib/i18n";
import {
  initGlobalEventDelegation,
  useRouteAnalytics,
} from "@/lib/analytics";

// One-time global click/submit delegation for GA4. Safe to call at module
// import time: it's idempotent and never throws if gtag hasn't loaded yet.
initGlobalEventDelegation();

// Mount inside the Router so SPA navigations fire a `page_view` event.
function RouteAnalytics() {
  useRouteAnalytics();
  return null;
}

function App() {
  return (
    <I18nProvider>
      <div className="App">
        <ErrorBoundary>
          <BrowserRouter>
            <RouteAnalytics />
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/account/pending-deletion" element={<PendingDeletion />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route
                path="/"
                element={
                  <RequireAuth>
                    <WallBoard />
                  </RequireAuth>
                }
              />
              <Route
                path="/time-plan"
                element={
                  <RequireAuth>
                    <TimePlan />
                  </RequireAuth>
                }
              />
              <Route
                path="/routines"
                element={
                  <RequireAuth>
                    <Routines />
                  </RequireAuth>
                }
              />
              <Route
                path="/home-budget"
                element={
                  <RequireAuth>
                    <HomeBudget />
                  </RequireAuth>
                }
              />
              <Route
                path="/shopping"
                element={
                  <RequireAuth>
                    <ShoppingList />
                  </RequireAuth>
                }
              />
              <Route
                path="/family-members"
                element={
                  <RequireAuth>
                    <FamilyMembers />
                  </RequireAuth>
                }
              />
              <Route
                path="/my-money"
                element={
                  <RequireAuth>
                    <MyMoney />
                  </RequireAuth>
                }
              />
              <Route path="/terms" element={<Terms />} />
              {/* Public legal pages — accessible with or without authentication. */}
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms-of-service" element={<TermsOfService />} />
              <Route path="/legal-notice" element={<LegalNotice />} />
              <Route path="/disclaimer" element={<Disclaimer />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/admin/content" element={<AdminContent />} />
              <Route path="/admin/email-settings" element={<AdminEmailSettings />} />
              {/* Legacy paths -> redirect to home */}
              <Route path="/wall-board" element={<Navigate to="/" replace />} />
              <Route path="/dashboard" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </ErrorBoundary>
        <Toaster richColors position="top-center" />
      </div>
    </I18nProvider>
  );
}

export default App;
