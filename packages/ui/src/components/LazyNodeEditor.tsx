"use client";

import { lazy, Suspense } from "react";
import { useLocale } from "../i18n/LocaleContext";

const NodeEditor = lazy(() => import("./NodeEditor").then((module) => ({ default: module.NodeEditor })));

export function LazyNodeEditor(props: { embedded?: boolean }) {
  const { t } = useLocale();
  return (
    <Suspense fallback={<div className="h-full animate-pulse bg-[var(--color-surface-raised)]" aria-label={t.editorLoading} />}>
      <NodeEditor {...props} />
    </Suspense>
  );
}
