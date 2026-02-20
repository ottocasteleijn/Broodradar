import { Link, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Package, Store, History, Camera, LogOut, Menu, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api, type Retailer } from "@/api/client";

const navItems = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Producten", href: "/producten", icon: Package },
  { title: "Supermarkten", href: "/supermarkten", icon: Store },
  { title: "Tijdlijn", href: "/timeline", icon: History },
  { title: "Snapshots", href: "/snapshots", icon: Camera },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { email, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<"success" | "error" | null>(null);

  useEffect(() => {
    api.retailers().then(setRetailers).catch(() => {});
  }, []);

  const handleRefreshAll = async () => {
    setRefreshLoading(true);
    setRefreshMessage(null);
    try {
      const data = await api.refreshAll();
      const failed = Object.entries(data.results).filter(([, v]) => !v.ok);
      setRefreshMessage(failed.length === 0 ? "success" : "error");
    } catch {
      setRefreshMessage("error");
    } finally {
      setRefreshLoading(false);
    }
  };

  const initials = email
    ? email.slice(0, 2).toUpperCase()
    : '??';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <>
      {/* Mobile Menu Button - alleen zichtbaar wanneer sidebar dicht is */}
      {!isOpen && (
        <button
          className="md:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-md shadow-md"
          onClick={() => setIsOpen(true)}
        >
          <Menu className="h-6 w-6 text-slate-700" />
        </button>
      )}

      {/* Sidebar Container */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 text-white transform transition-transform duration-200 ease-in-out md:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-slate-800 flex items-start gap-3">
            {/* Toggle in header: op mobile zichtbaar wanneer sidebar open, op desktop verborgen */}
            <button
              className={cn(
                "shrink-0 p-2 -m-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors",
                "md:hidden"
              )}
              onClick={() => setIsOpen(false)}
              aria-label="Menu sluiten"
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight">Broodradar</h1>
              <p className="text-xs text-slate-400 mt-1">Supermarket Intelligence</p>
            </div>
          </div>

          <nav className="flex-1 px-4 py-6 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors",
                    isActive
                      ? "bg-blue-600 text-white"
                      : "text-slate-400 hover:text-white hover:bg-slate-800"
                  )}
                  onClick={() => setIsOpen(false)}
                >
                  <Icon className="h-5 w-5" />
                  {item.title}
                </Link>
              );
            })}
          </nav>

          <div className="px-4 py-4 border-t border-slate-800 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {retailers.filter((r) => r.active).map((r) => (
                r.icon ? (
                  <img key={r.id} src={r.icon} alt="" className="h-6 w-6 object-contain" title={r.name} />
                ) : null
              ))}
            </div>
            <button
              type="button"
              onClick={handleRefreshAll}
              disabled={refreshLoading}
              className="flex items-center gap-2 w-full px-4 py-2.5 text-sm font-medium rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={cn("h-4 w-4", refreshLoading && "animate-spin")} />
              {refreshLoading ? "Bezig…" : "Ververs alle supermarkten"}
            </button>
            {refreshMessage === "success" && (
              <p className="text-xs text-emerald-400">Snapshots bijgewerkt</p>
            )}
            {refreshMessage === "error" && (
              <p className="text-xs text-red-400">Er ging iets mis</p>
            )}
          </div>

          <div className="p-4 border-t border-slate-800">
            <div className="flex items-center gap-3 px-4 py-3 mb-2">
              <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold">
                {initials}
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-medium truncate">{email || 'Niet ingelogd'}</p>
                <p className="text-xs text-slate-500">Admin</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-2 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors w-full"
            >
              <LogOut className="h-4 w-4" />
              Uitloggen
            </button>
          </div>
        </div>
      </div>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
