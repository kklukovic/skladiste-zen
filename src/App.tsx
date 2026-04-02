import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Inventory from "./pages/Inventory";
import Articles from "./pages/Articles";
import Projects from "./pages/Projects";
import NovaPrimka from "./pages/NovaPrimka";
import NovaOtpremnica from "./pages/NovaOtpremnica";
import PovratMaterijala from "./pages/PovratMaterijala";
import Reports from "./pages/Reports";
import SettingsPage from "./pages/SettingsPage";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function ProtectedRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Učitavanje...</div>;
  if (!user) return <Login />;

  return (
    <Routes>
      <Route path="/" element={<Inventory />} />
      <Route path="/artikli" element={<AdminRoute><Articles /></AdminRoute>} />
      <Route path="/projekti" element={<Projects />} />
      <Route path="/primka" element={<AdminRoute><NovaPrimka /></AdminRoute>} />
      <Route path="/otpremnica" element={<NovaOtpremnica />} />
      <Route path="/povrat" element={<PovratMaterijala />} />
      <Route path="/izvjestaji" element={<AdminRoute><Reports /></AdminRoute>} />
      <Route path="/postavke" element={<AdminRoute><SettingsPage /></AdminRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/*" element={<ProtectedRoutes />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
