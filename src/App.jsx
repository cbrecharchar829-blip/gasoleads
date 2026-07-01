// HashRouter (URLs like /#/leads/123) works on GitHub Pages without any server
// rewrite rules, so deep links and refreshes never 404 on static hosting.
import { HashRouter, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import Blitzkrieg from "@/pages/Blitzkrieg";
import Leads from "@/pages/Leads";
import LeadDetail from "@/pages/LeadDetail";
import MapView from "@/pages/MapView";
import CadenceSettings from "@/pages/CadenceSettings";
import { Toaster } from "@/components/ui/toaster";

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/blitzkrieg" element={<Blitzkrieg />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/leads/:id" element={<LeadDetail />} />
        <Route path="/map" element={<MapView />} />
        <Route path="/settings" element={<CadenceSettings />} />
      </Routes>
      <Toaster />
    </HashRouter>
  );
}
