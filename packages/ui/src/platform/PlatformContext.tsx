"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PlatformAdapter } from "./platform-adapter";
import { createWebPlatformAdapter } from "./web-adapter";

const PlatformContext = createContext<PlatformAdapter | null>(null);

/** Used when no provider is mounted: same-origin HTTP API, the behaviour before adapters existed. */
let fallbackAdapter: PlatformAdapter | null = null;

export function PlatformProvider({ adapter, children }: { adapter: PlatformAdapter; children: ReactNode }) {
  return <PlatformContext.Provider value={adapter}>{children}</PlatformContext.Provider>;
}

/**
 * The adapter of the host. Without a `PlatformProvider` this is the web adapter, so a host that has
 * not been migrated keeps talking to `/api/...` and fails with a `PlatformError` when that API is
 * not there, instead of crashing on a missing context.
 */
export function usePlatform(): PlatformAdapter {
  const adapter = useContext(PlatformContext);
  if (adapter) return adapter;
  fallbackAdapter ??= createWebPlatformAdapter();
  return fallbackAdapter;
}
