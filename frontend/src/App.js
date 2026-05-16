import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "@/pages/Dashboard";
import TimePlan from "@/pages/TimePlan";
import Login from "@/pages/Login";
import { Toaster } from "@/components/ui/sonner";
import ErrorBoundary from "@/components/ErrorBoundary";
import RequireAuth from "@/components/RequireAuth";

function App() {
  return (
    <div className="App">
      <ErrorBoundary>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <Dashboard />
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
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
      <Toaster richColors position="top-center" />
    </div>
  );
}

export default App;
