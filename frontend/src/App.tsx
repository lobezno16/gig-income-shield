import { Navigate, Route, Routes } from "react-router-dom";

import { RegistrationPage } from "./pages/worker/Registration";
import { WorkerDashboardPage } from "./pages/worker/Dashboard";
import { WorkerPolicyPage } from "./pages/worker/Policy";
import { WorkerPremiumPage } from "./pages/worker/Premium";
import { WorkerClaimsPage } from "./pages/worker/Claims";
import { AdminOverviewPage } from "./pages/admin/Overview";
import { BCRDashboardPage } from "./pages/admin/BCRDashboard";
import { HexHeatmapPage } from "./pages/admin/HexHeatmap";
import { ClaimsQueuePage } from "./pages/admin/ClaimsQueue";
import { FraudAlertsPage } from "./pages/admin/FraudAlerts";
import { MLDashboardPage } from "./pages/admin/MLDashboard";

export default function App() {
  return (
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
  );
}

