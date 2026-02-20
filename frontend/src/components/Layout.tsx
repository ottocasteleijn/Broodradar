import { Sidebar } from "./Sidebar";
import { Outlet } from "react-router-dom";

export default function Layout() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <main className="md:pl-64 min-h-screen transition-all duration-200">
        <div className="container mx-auto p-6 md:p-8 max-w-7xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
