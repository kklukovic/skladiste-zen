import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Inventory from "./pages/Inventory";
import Articles from "./pages/Articles";
import Projects from "./pages/Projects";
import NovaPrimka from "./pages/NovaPrimka";
import NovaOtpremnica from "./pages/NovaOtpremnica";
import DocumentForm from "./pages/DocumentForm";
import Reports from "./pages/Reports";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Inventory />} />
          <Route path="/artikli" element={<Articles />} />
          <Route path="/projekti" element={<Projects />} />
          <Route path="/primka" element={<NovaPrimka />} />
          <Route path="/otpremnica" element={<NovaOtpremnica />} />
          <Route path="/povrat" element={<DocumentForm docType="return" />} />
          <Route path="/izvjestaji" element={<Reports />} />
          <Route path="/postavke" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
