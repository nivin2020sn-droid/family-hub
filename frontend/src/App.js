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
import Login from "@/pages/Login";
import { Toaster } from "@/components/ui/sonner";
import ErrorBoundary from "@/components/ErrorBoundary";
import RequireAuth from "@/components/RequireAuth";
import { I18nProvider } from "@/lib/i18n";

function App() {
  return (
    <I18nProvider>
      <div className="App">
        <ErrorBoundary>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
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
              <Route path="/admin" element={<Admin />} />
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
