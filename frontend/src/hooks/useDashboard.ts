import { useQuery } from "@tanstack/react-query";

import { getDashboard } from "../api/client";

export function useDashboard(workerId: string) {
  return useQuery({
    queryKey: ["dashboard", workerId],
    queryFn: () => getDashboard(workerId),
    refetchInterval: 30_000,
    enabled: Boolean(workerId),
  });
}
