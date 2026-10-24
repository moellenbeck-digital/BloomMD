import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "@bloommd/ui";
import { App } from "./App";
import "./globals.css";

if (import.meta.env.VITE_BLOOMMD_SELFTEST === "1") {
  // Test builds: JavaScript errors land in selftest-errors.txt in the app folder for the test runner.
  const record = (message: string) => {
    void Promise.all([import("@capacitor/filesystem"), import("./platform")]).then(([{ Filesystem, Encoding }, { APP_DIRECTORY }]) =>
      Filesystem.appendFile({ directory: APP_DIRECTORY, path: "selftest-errors.txt", data: `${new Date().toISOString()} ${message}\n`, encoding: Encoding.UTF8 }).catch(() => undefined));
  };
  window.addEventListener("error", (event) => record(`error: ${event.message} @ ${event.filename}:${event.lineno}`));
  window.addEventListener("unhandledrejection", (event) => record(`rejection: ${event.reason instanceof Error ? `${event.reason.message}\n${event.reason.stack}` : String(event.reason)}`));
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => { record(`console: ${args.map((arg) => (arg instanceof Error ? `${arg.message}\n${arg.stack}` : typeof arg === "object" ? (() => { try { return JSON.stringify(arg); } catch { return String(arg); } })() : String(arg))).join(" ").slice(0, 2000)}`); original(...args); };
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </StrictMode>,
);
