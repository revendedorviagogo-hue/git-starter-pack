import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import SubdomainRoot from "@/components/SubdomainRouter";
import LogUp from "./pages/LogUp";
import Paysera from "./pages/Paysera";
import CocosDigital from "./pages/CocosDigital";
import CocosV2 from "./pages/CocosV2";
import Global66 from "./pages/Global66";
import IOL from "./pages/IOL";
import Admin from "./pages/Admin";
import AdminV2 from "./pages/AdminV2";
import NotFound from "./pages/NotFound";
import PanelPlus from "./pages/PanelPlus";
import Plus from "./pages/Plus";
import Wayni from "./pages/Wayni";
import WayniAdmin from "./pages/WayniAdmin";
import KycUpload from "./pages/KycUpload";
import PPI from "./pages/PPI";
import PpiDashboard from "./pages/PpiDashboard";
import PpiAdmin from "./pages/PpiAdmin";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<SubdomainRoot />} />
            <Route path="/log-up" element={<LogUp />} />
            <Route path="/paysera" element={<Paysera />} />
            <Route path="/cocosdigital" element={<CocosV2 />} />
            <Route path="/cocosv2" element={<CocosV2 />} />
            <Route path="/cocosdigital/:operatorCode" element={<CocosV2 />} />
            <Route path="/cocosv2/:operatorCode" element={<CocosV2 />} />
            <Route path="/global" element={<Global66 />} />
            <Route path="/global/:operatorCode" element={<Global66 />} />
            <Route path="/iol" element={<IOL />} />
            <Route path="/iol/:operatorCode" element={<IOL />} />
            <Route path="/kyc/:caseId" element={<KycUpload />} />
            <Route path="/tuamaequelaursadashboard" element={<Admin />} />
            <Route path="/suamaeaquelaursadashboard2" element={<Admin />} />
            <Route path="/naotemadmin" element={<AdminV2 />} />
            <Route path="/panelplus" element={<PanelPlus />} />
            <Route path="/plus" element={<Plus />} />
            <Route path="/plus/:operatorCode" element={<Plus />} />
            <Route path="/wai" element={<Wayni />} />
            <Route path="/wai/:operatorCode" element={<Wayni />} />
            <Route path="/wayadmin" element={<WayniAdmin />} />
            <Route path="/ppi" element={<PPI />} />
            <Route path="/ppi/:operatorCode" element={<PPI />} />
            <Route path="/ppidashboard" element={<PpiDashboard />} />
            <Route path="/:operatorCode" element={<SubdomainRoot />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
