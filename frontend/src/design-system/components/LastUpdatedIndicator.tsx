import { useEffect, useMemo, useState } from "react";

interface LastUpdatedIndicatorProps {
  updatedAt?: number;
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s ago`;
}

export function LastUpdatedIndicator({ updatedAt }: LastUpdatedIndicatorProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const text = useMemo(() => {
    if (!updatedAt || updatedAt <= 0) {
      return "Last updated --";
    }
    return `Last updated ${formatElapsed(now - updatedAt)}`;
  }, [now, updatedAt]);

  return <p className="admin-last-updated">{text}</p>;
}
