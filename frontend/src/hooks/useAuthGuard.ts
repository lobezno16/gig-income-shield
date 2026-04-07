import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { useWorkerStore } from "../store/workerStore";

export function useAuthGuard() {
  const { isAuthenticated, isLoading } = useWorkerStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/register", { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  return { isAuthenticated, isLoading };
}
