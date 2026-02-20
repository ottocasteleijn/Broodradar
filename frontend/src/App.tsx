import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Layout from "@/components/Layout";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import ProductsPage from "@/pages/ProductsPage";
import SupermarketsPage from "@/pages/SupermarketsPage";
import SupermarketPage from "@/pages/SupermarketPage";
import TimelinePage from "@/pages/TimelinePage";
import SnapshotsPage from "@/pages/SnapshotsPage";
import ProductDetailPage from "@/pages/ProductDetailPage";
import { Skeleton } from "@/components/ui/Skeleton";
import type { ReactNode } from "react";

function AuthLoadingSkeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-4 w-full max-w-xs px-4">
        <Skeleton className="h-10 w-48 rounded-lg" />
        <Skeleton text className="w-40" />
        <Skeleton text className="w-32" />
        <Skeleton text className="w-36" />
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { email, loading } = useAuth();
  if (loading) {
    return <AuthLoadingSkeleton />;
  }
  if (!email) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
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
              <Route path="/producten" element={<ProductsPage />} />
              <Route path="/supermarkten" element={<SupermarketsPage />} />
              <Route path="/supermarket/:id" element={<SupermarketPage />} />
              <Route path="/timeline" element={<TimelinePage />} />
              <Route path="/snapshots" element={<SnapshotsPage />} />
              <Route path="/product/ref/:retailer/:webshopId" element={<ProductDetailPage />} />
              <Route path="/product/:id/versie/:snapshotId" element={<ProductDetailPage />} />
              <Route path="/product/:id" element={<ProductDetailPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
