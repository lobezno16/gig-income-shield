import { useQuery } from "@tanstack/react-query";

import { getPolicy } from "../api/client";

export function usePolicy(workerId: string) {
  return useQuery({
    queryKey: ["policy", workerId],
    queryFn: () => getPolicy(workerId),
    enabled: Boolean(workerId),
    staleTime: 60_000,
  });
}
