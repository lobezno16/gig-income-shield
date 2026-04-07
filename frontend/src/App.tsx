import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { InstallAppPrompt } from "./components/InstallAppPrompt";

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

export default function App() {
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
      <Routes>
        <Route path="/" element={<Navigate to="/register" replace />} />
        <Route path="/register" element={<RegistrationPage />} />
        <Route path="/dashboard" element={<WorkerDashboardPage />} />
        <Route path="/policy" element={<WorkerPolicyPage />} />
        <Route path="/premium" element={<WorkerPremiumPage />} />
        <Route path="/claims" element={<WorkerClaimsPage />} />
        <Route path="/admin" element={<AdminOverviewPage />} />
        <Route path="/admin/bcr" element={<BCRDashboardPage />} />
        <Route path="/admin/heatmap" element={<HexHeatmapPage />} />
        <Route path="/admin/claims" element={<ClaimsQueuePage />} />
        <Route path="/admin/fraud" element={<FraudAlertsPage />} />
        <Route path="/admin/ml" element={<MLDashboardPage />} />
        <Route path="*" element={<Navigate to="/register" replace />} />
      </Routes>
    </Suspense>
  );
}
