import { useQuery } from "@tanstack/react-query";

import { getPremium } from "../api/client";

export function usePremium(workerId: string) {
  return useQuery({
    queryKey: ["premium", workerId],
    queryFn: () => getPremium(workerId),
    enabled: Boolean(workerId),
    refetchInterval: 30_000,
  });
}

