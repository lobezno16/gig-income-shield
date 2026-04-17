import { WorkerShell } from "../../components/WorkerShell";
import { WorkerDashboard } from "../../components/dashboard/WorkerDashboard";
import { useAuthGuard } from "../../hooks/useAuthGuard";
import { useWorkerStore } from "../../store/workerStore";

export function WorkerDashboardPage() {
  const { isAuthenticated, isLoading } = useAuthGuard();
  const currentWorker = useWorkerStore((state) => state.currentWorker);

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated || !currentWorker) {
    return null;
  }

  return (
    <WorkerShell activeTab="home" pageTitle="Dashboard" maxWidth={1120}>
      <WorkerDashboard worker={currentWorker} />
    </WorkerShell>
  );
}
