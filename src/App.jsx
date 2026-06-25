import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import Leads from "@/pages/Leads";
import LeadDetail from "@/pages/LeadDetail";
import MapView from "@/pages/MapView";
import CadenceSettings from "@/pages/CadenceSettings";
import { Toaster } from "@/components/ui/toaster";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/leads/:id" element={<LeadDetail />} />
        <Route path="/map" element={<MapView />} />
        <Route path="/settings" element={<CadenceSettings />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}
