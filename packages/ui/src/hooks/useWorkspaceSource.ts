import { useCallback, useRef, useState } from "react";
import { usePlatform } from "../platform/PlatformContext";
import { useLocale } from "../i18n/LocaleContext";
import { openWorkspaceSource, workspaceSourceTarget } from "../utils/workspaceSource";
import { useMindMapStore } from "./useMindMapStore";

export function useWorkspaceSource() {
  const platform = usePlatform();
  const { t } = useLocale();
  const pending = useRef(false);
  const [opening, setOpening] = useState(false);
  const open = useCallback(async (nodeId: string) => {
    if (pending.current) return;
    const target = workspaceSourceTarget(useMindMapStore.getState().document, nodeId);
    if (!target) return;
    pending.current = true;
    setOpening(true);
    try {
      if (platform.workspace) await platform.workspace.openSource(target);
      else openWorkspaceSource(target.file);
    } catch (error) {
      console.error("[BloomMD] Opening workspace source failed:", error);
      useMindMapStore.getState().setStatusMessage(t.filesLoadFailed);
    } finally {
      pending.current = false;
      setOpening(false);
    }
  }, [platform, t.filesLoadFailed]);
  return { open, opening, canEdit: platform.workspace?.canEdit ?? false };
}
