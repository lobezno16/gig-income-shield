import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { getMe } from "./api/auth";
import { useWorkerStore } from "./store/workerStore";
import "./main.css";

const queryClient = new QueryClient();

function SessionLoadingScreen() {
  return (
    <main className="session-loader">
      <style>{`
        @keyframes soteria-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <section className="session-loader__content">
        <p className="session-loader__wordmark">Soteria</p>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            border: "3px solid rgba(255,255,255,0.12)",
            borderTopColor: "var(--accent)",
            margin: "0 auto",
            animation: "soteria-spin 0.9s linear infinite",
          }}
        />
      </section>
    </main>
  );
}

function SessionBootstrap({ children }: { children: React.ReactNode }) {
  const setCurrentWorker = useWorkerStore((state) => state.setCurrentWorker);
  const clearAuth = useWorkerStore((state) => state.clearAuth);
  const setIsLoading = useWorkerStore((state) => state.setIsLoading);
  const [isBootstrapped, setIsBootstrapped] = useState(false);
  const hasStartedBootstrap = useRef(false);

  useEffect(() => {
    if (hasStartedBootstrap.current) return;
    hasStartedBootstrap.current = true;

    const run = async () => {
      setIsLoading(true);

      // Proactively clean up any legacy state left over in localStorage
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("soteria_worker_v1");
      }

      const worker = await getMe();

      if (worker) {
        setCurrentWorker(worker);
      } else {
        clearAuth();
      }

      setIsLoading(false);
      setIsBootstrapped(true);
    };

    void run();
  }, [clearAuth, setCurrentWorker, setIsLoading]);

  if (!isBootstrapped) {
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
