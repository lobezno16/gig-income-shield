import { Badge } from "./Badge";

type Status = "covered" | "alert" | "processing" | "action_req" | "inactive";

const config: Record<Status, { label: string; tone: "success" | "warning" | "info" | "danger" | "muted" }> = {
  covered: { label: "COVERED", tone: "success" },
  alert: { label: "ALERT", tone: "warning" },
  processing: { label: "PROCESSING", tone: "info" },
  action_req: { label: "ACTION REQ", tone: "danger" },
  inactive: { label: "INACTIVE", tone: "muted" },
};

export function StatusIndicator({ status }: { status: Status }) {
  const c = config[status];
  return <Badge tone={c.tone}>{c.label}</Badge>;
}

