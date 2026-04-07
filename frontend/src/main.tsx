import React, { useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { useWorkerStore } from "./store/workerStore";
import "./main.css";

const queryClient = new QueryClient();

function SessionLoadingScreen() {
  return (
    <main className="session-loader">
      <style>{`
        @keyframes soteria-shimmer {
          0% { background-position: -240px 0; }
          100% { background-position: 240px 0; }
        }
      `}</style>
      <section className="session-loader__content">
        <p className="session-loader__wordmark">Soteria</p>
        <div className="session-loader__stack">
          <div className="session-loader__line" />
          <div className="session-loader__line session-loader__line--short" />
          <div className="session-loader__line session-loader__line--medium" />
        </div>
      </section>
    </main>
  );
}

function SessionBootstrap({ children }: { children: React.ReactNode }) {
  const restoreSession = useWorkerStore((state) => state.restoreSession);
  const isLoading = useWorkerStore((state) => state.isLoading);
  const hasRequestedSession = useRef(false);

  useEffect(() => {
    if (hasRequestedSession.current) return;
    hasRequestedSession.current = true;
    void restoreSession();
  }, [restoreSession]);

  if (isLoading) {
    return <SessionLoadingScreen />;
  }

  return <>{children}</>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionBootstrap>
          <App />
        </SessionBootstrap>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Service worker is optional; app stays functional without it.
    });
  });
}
