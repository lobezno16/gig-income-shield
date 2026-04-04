import type { PropsWithChildren } from "react";

type BadgeTone = "success" | "warning" | "danger" | "info" | "muted" | "accent";

const toneMap: Record<BadgeTone, { bg: string; border: string; text: string }> = {
  success: { bg: "rgba(0,217,126,0.12)", border: "var(--success)", text: "var(--success)" },
  warning: { bg: "rgba(245,166,35,0.12)", border: "var(--warning)", text: "var(--warning)" },
  danger: { bg: "rgba(255,59,59,0.12)", border: "var(--danger)", text: "var(--danger)" },
  info: { bg: "rgba(59,158,255,0.12)", border: "var(--info)", text: "var(--info)" },
  muted: { bg: "var(--bg-elevated)", border: "var(--text-disabled)", text: "var(--text-secondary)" },
  accent: { bg: "rgba(91,79,255,0.12)", border: "var(--accent)", text: "var(--accent)" },
};

export function Badge({ tone = "muted", children }: PropsWithChildren<{ tone?: BadgeTone }>) {
  const toneStyle = toneMap[tone];
  return (
    <span
      className="status-badge"
      style={{
        background: toneStyle.bg,
        borderColor: toneStyle.border,
        color: toneStyle.text,
      }}
    >
      {children}
    </span>
  );
}

