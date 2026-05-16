import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "@/pages/Dashboard";
import TimePlan from "@/pages/TimePlan";
import { Toaster } from "@/components/ui/sonner";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/time-plan" element={<TimePlan />} />
        </Routes>
      </BrowserRouter>
      <Toaster richColors position="top-center" />
    </div>
  );
}

export default App;
