import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "@/pages/Dashboard";
import TimePlan from "@/pages/TimePlan";
import { Toaster } from "@/components/ui/sonner";
import ErrorBoundary from "@/components/ErrorBoundary";

function App() {
  return (
    <div className="App">
      <ErrorBoundary>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/time-plan" element={<TimePlan />} />
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
      <Toaster richColors position="top-center" />
    </div>
  );
}

export default App;
