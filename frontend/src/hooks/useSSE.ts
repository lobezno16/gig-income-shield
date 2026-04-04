import { useEffect, useRef, useState } from "react";

type SseEvent = {
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
};

export function useSSE(path: string) {
  const [events, setEvents] = useState<SseEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const base = import.meta.env.VITE_API_URL || "http://localhost:8000";
    const source = new EventSource(`${base}${path}`);
    sourceRef.current = source;

    source.onopen = () => setConnected(true);
    source.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as SseEvent;
        setEvents((prev) => [parsed, ...prev].slice(0, 100));
      } catch {
        // no-op
      }
    };
    source.onerror = () => setConnected(false);

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, [path]);

  return { events, connected };
}

