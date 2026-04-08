import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { InstallAppPrompt } from "./components/InstallAppPrompt";
import { useWorkerStore } from "./store/workerStore";

const RegistrationPage = lazy(() => import("./pages/worker/Registration").then((m) => ({ default: m.RegistrationPage })));
const WorkerDashboardPage = lazy(() => import("./pages/worker/Dashboard").then((m) => ({ default: m.WorkerDashboardPage })));
const WorkerPolicyPage = lazy(() => import("./pages/worker/Policy").then((m) => ({ default: m.WorkerPolicyPage })));
const WorkerPremiumPage = lazy(() => import("./pages/worker/Premium").then((m) => ({ default: m.WorkerPremiumPage })));
const WorkerClaimsPage = lazy(() => import("./pages/worker/Claims").then((m) => ({ default: m.WorkerClaimsPage })));
const AdminOverviewPage = lazy(() => import("./pages/admin/Overview").then((m) => ({ default: m.AdminOverviewPage })));
const BCRDashboardPage = lazy(() => import("./pages/admin/BCRDashboard").then((m) => ({ default: m.BCRDashboardPage })));
const HexHeatmapPage = lazy(() => import("./pages/admin/HexHeatmap").then((m) => ({ default: m.HexHeatmapPage })));
const ClaimsQueuePage = lazy(() => import("./pages/admin/ClaimsQueue").then((m) => ({ default: m.ClaimsQueuePage })));
const FraudAlertsPage = lazy(() => import("./pages/admin/FraudAlerts").then((m) => ({ default: m.FraudAlertsPage })));
const MLDashboardPage = lazy(() => import("./pages/admin/MLDashboard").then((m) => ({ default: m.MLDashboardPage })));

function AdminGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, currentWorker } = useWorkerStore();
  const location = useLocation();
  const role = currentWorker?.role;
  const isAdmin = isAuthenticated && (role === "admin" || role === "superadmin");

  if (isLoading) {
    return (
      <main className="layout" style={{ maxWidth: 720 }}>
        <section className="card">
          <h1 style={{ marginTop: 0 }}>Checking access...</h1>
          <p style={{ color: "var(--text-secondary)", marginBottom: 0 }}>Validating admin credentials.</p>
        </section>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <Navigate
        to="/register"
        replace
        state={{
          message: "Admin access required",
          from: location.pathname,
        }}
      />
    );
  }

  return <>{children}</>;
}

export default function App() {
  const location = useLocation();

  return (
    <Suspense
      fallback={
        <main className="layout" style={{ maxWidth: 720 }}>
          <section className="card">
            <h1 style={{ marginTop: 0 }}>Loading Soteria...</h1>
            <p style={{ color: "var(--text-secondary)" }}>Preparing worker safety cockpit.</p>
          </section>
        </main>
      }
    >
      <InstallAppPrompt />
      <div key={location.pathname} className="route-fade">
        <Routes>
          <Route path="/" element={<Navigate to="/register" replace />} />
          <Route path="/register" element={<RegistrationPage />} />
          <Route path="/dashboard" element={<WorkerDashboardPage />} />
          <Route path="/policy" element={<WorkerPolicyPage />} />
          <Route path="/premium" element={<WorkerPremiumPage />} />
          <Route path="/claims" element={<WorkerClaimsPage />} />
          <Route
            path="/admin"
            element={
              <AdminGuard>
                <AdminOverviewPage />
              </AdminGuard>
            }
          />
          <Route
            path="/admin/bcr"
            element={
              <AdminGuard>
                <BCRDashboardPage />
              </AdminGuard>
            }
          />
          <Route
            path="/admin/heatmap"
            element={
              <AdminGuard>
                <HexHeatmapPage />
              </AdminGuard>
            }
          />
          <Route
            path="/admin/claims"
            element={
              <AdminGuard>
                <ClaimsQueuePage />
              </AdminGuard>
            }
          />
          <Route
            path="/admin/fraud"
            element={
              <AdminGuard>
                <FraudAlertsPage />
              </AdminGuard>
            }
          />
          <Route
            path="/admin/ml"
            element={
              <AdminGuard>
                <MLDashboardPage />
              </AdminGuard>
            }
          />
          <Route path="*" element={<Navigate to="/register" replace />} />
        </Routes>
      </div>
    </Suspense>
  );
}
