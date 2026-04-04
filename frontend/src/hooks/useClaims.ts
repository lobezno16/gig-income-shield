import { useQuery } from "@tanstack/react-query";

import { getClaims } from "../api/client";

export function useClaims(workerId: string) {
  return useQuery({
    queryKey: ["claims", workerId],
    queryFn: () => getClaims(workerId),
    enabled: Boolean(workerId),
    refetchInterval: 20_000,
  });
}

