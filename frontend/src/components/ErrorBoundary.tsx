// @ts-nocheck — React error boundaries require class components; project TS config conflicts with class inheritance
import React from "react";

export class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("Uncaught error:", error, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
          <div className="max-w-md w-full bg-white rounded-xl border border-red-200 shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-red-700">Er ging iets mis</h2>
            <p className="text-sm text-slate-600">
              {this.state.error?.message || "Onbekende fout"}
            </p>
            <button
              onClick={() => window.location.assign("/")}
              className="px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800"
            >
              Terug naar dashboard
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
