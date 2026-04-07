import { useEffect, useMemo, useState } from "react";

import { Button } from "../design-system/components/Button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function InstallAppPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [iosHelpVisible, setIosHelpVisible] = useState(false);
  const isStandalone = typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches;

  const isIosStandalone = useMemo(
    () => typeof window !== "undefined" && (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
    []
  );
  const isIosBrowser = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(ua) && !isIosStandalone;
  }, [isIosStandalone]);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setDeferredPrompt(null);
      setIosHelpVisible(false);
      setDismissed(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  if (dismissed || isStandalone) return null;
  if (!deferredPrompt && !isIosBrowser) return null;

  async function installPwa() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setDismissed(true);
    }
    setDeferredPrompt(null);
  }

  function dismissPrompt() {
    setDismissed(true);
  }

  return (
    <div
      className="surface"
      role="dialog"
      aria-label="Install Soteria App"
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 1000,
        padding: 12,
      }}
    >
      <p style={{ margin: 0, fontWeight: 700 }}>Install Soteria App</p>
      <p style={{ margin: "6px 0 12px 0", color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
        Use Soteria like a real app with full-screen launch and faster startup.
      </p>
      {isIosBrowser && !deferredPrompt ? (
        <p style={{ margin: "0 0 12px 0", color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
          On iPhone/iPad: tap Share, then select Add to Home Screen.
        </p>
      ) : null}
      {iosHelpVisible ? (
        <p className="mono" style={{ margin: "0 0 12px 0", fontSize: "var(--text-sm)" }}>
          SHARE {"->"} ADD TO HOME SCREEN
        </p>
      ) : null}
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
        {deferredPrompt ? (
          <Button onClick={installPwa} aria-label="Install Soteria application">
            Install App
          </Button>
        ) : (
          <Button onClick={() => setIosHelpVisible((v) => !v)} aria-label="Show iOS install instructions">
            Show Steps
          </Button>
        )}
        <Button variant="ghost" onClick={dismissPrompt} aria-label="Dismiss install prompt">
          Dismiss
        </Button>
      </div>
    </div>
  );
}
