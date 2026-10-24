import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider, configureLayoutWorker } from "@bloommd/ui";
import LayoutWorker from "./layout.worker?worker&inline";
import { recordE2EState } from "./rpc";
import { installPerformanceProbe } from "./performance-probe";
import { App } from "./App";
import "./globals.css";

window.addEventListener("bloommd:layout-error", (event) => {
  void recordE2EState({ source: `layoutError: ${(event as CustomEvent<string>).detail}` }).catch(console.error);
});

window.addEventListener("bloommd:layout-ready", (event) => {
  void recordE2EState({ source: "layoutReady", nodeCount: (event as CustomEvent<{ nodeCount: number }>).detail.nodeCount }).catch(console.error);
});

configureLayoutWorker(() => new LayoutWorker());

if (import.meta.env.VITE_BLOOMMD_PROFILE === "1") installPerformanceProbe();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </StrictMode>,
);
