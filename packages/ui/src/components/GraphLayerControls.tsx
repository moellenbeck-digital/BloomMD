import { FolderTree, GitFork, Link2, Unlink } from "lucide-react";
import {
  GRAPH_PRESETS,
  matchPreset,
  type GraphCounts,
  type GraphLayers,
  type GraphPreset,
} from "@bloommd/core/browser";
import { useLocale } from "../i18n/LocaleContext";

export interface GraphLayerControlsProps {
  layers: GraphLayers;
  counts: GraphCounts;
  onChange: (layers: GraphLayers) => void;
  /** Set when a node is selected, which is what makes the backlink layer meaningful. */
  hasSelection: boolean;
}

/** Named explicitly rather than as `keyof GraphLayers`, which widens to include symbol keys. */
type LayerKey = "folders" | "references" | "backlinks" | "brokenLinks";

interface ToggleSpec {
  key: LayerKey;
  label: string;
  hint: string;
  Icon: typeof FolderTree;
  count: number;
}

/**
 * Layer switches for the workspace map.
 *
 * The presets are the primary control and the individual toggles are the escape hatch, because the
 * three named perspectives cover what people actually ask for while any combination stays reachable.
 * Counts sit on the toggles so the effect of turning a layer on is visible before turning it on —
 * particularly for broken links, which are worth noticing but must not dominate the map.
 */
export function GraphLayerControls({ layers, counts, onChange, hasSelection }: GraphLayerControlsProps) {
  const { t } = useLocale();
  const active = matchPreset(layers);
  const brokenTotal = counts.brokenReferences + counts.ambiguousReferences;
  const presetLabel: Record<GraphPreset, string> = { structure: t.presetStructure, reference: t.presetReferences, knowledge: t.presetKnowledge };
  const presetHint: Record<GraphPreset, string> = { structure: t.presetStructureHint, reference: t.presetReferencesHint, knowledge: t.presetKnowledgeHint };

  const toggles: ToggleSpec[] = [
    { key: "folders", label: t.layerFolders, hint: t.layerFoldersHint, Icon: FolderTree, count: counts.folders },
    { key: "references", label: t.layerReferences, hint: t.layerReferencesHint, Icon: Link2, count: counts.resolvedReferences },
    {
      key: "backlinks",
      label: t.layerBacklinks,
      hint: hasSelection ? t.layerBacklinksHint : t.layerBacklinksUnavailable,
      Icon: GitFork,
      count: 0,
    },
    { key: "brokenLinks", label: t.layerBrokenLinks, hint: t.layerBrokenLinksHint, Icon: Unlink, count: brokenTotal },
  ];

  return (
    <div
      data-testid="graph-layer-controls"
      className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-2 shadow-sm"
    >
      <div className="flex gap-1" role="group" aria-label={t.graphPerspective}>
        {(Object.keys(GRAPH_PRESETS) as GraphPreset[]).map((preset) => (
          <button
            key={preset}
            type="button"
            title={presetHint[preset]}
            aria-pressed={active === preset}
            data-testid={`graph-preset-${preset}`}
            onClick={() => onChange(GRAPH_PRESETS[preset])}
            className={`h-7 flex-1 rounded px-2 text-xs font-semibold transition ${
              active === preset
                ? "bg-[#FF6B35] text-white"
                : "text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sunken)]"
            }`}
          >
            {presetLabel[preset]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1" role="group" aria-label={t.individualLayers}>
        {toggles.map(({ key, label, hint, Icon, count }) => {
          const enabled = layers[key];
          // The backlink layer needs something selected before it can show anything, so it is
          // disabled rather than silently doing nothing.
          const unavailable = key === "backlinks" && !hasSelection;
          return (
            <button
              key={key}
              type="button"
              title={hint}
              disabled={unavailable}
              aria-pressed={enabled}
              data-testid={`graph-layer-${key}`}
              onClick={() => onChange({ ...layers, [key]: !enabled })}
              className={`inline-flex h-7 items-center gap-1 rounded border px-2 text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${
                enabled
                  ? "border-[var(--color-border-strong)] bg-[var(--color-surface-sunken)] text-[var(--color-ink)]"
                  : "border-transparent text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sunken)]"
              }`}
            >
              <Icon size={13} aria-hidden />
              <span>{label}</span>
              {count > 0 && <span className="tabular-nums opacity-60">{count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
