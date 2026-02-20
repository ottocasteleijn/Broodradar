import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Layout from "@/components/Layout";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import SupermarketPage from "@/pages/SupermarketPage";
import TimelinePage from "@/pages/TimelinePage";
import SnapshotsPage from "@/pages/SnapshotsPage";
import ComparePage from "@/pages/ComparePage";
import type { ReactNode } from "react";

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { email, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-500">Laden...</div>
      </div>
    );
  }
  if (!email) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/supermarket/:id" element={<SupermarketPage />} />
            <Route path="/timeline" element={<TimelinePage />} />
            <Route path="/snapshots" element={<SnapshotsPage />} />
            <Route path="/vergelijk" element={<ComparePage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
