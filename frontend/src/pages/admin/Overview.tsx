import { AdminActuaryDashboard } from "../../components/dashboard/AdminActuaryDashboard";
import { AdminLayout } from "./AdminLayout";

export function AdminOverviewPage() {
  return (
    <AdminLayout>
      <AdminActuaryDashboard />
    </AdminLayout>
  );
}
