/* Small shared data of the bloom scene. The placeholder card (bloom-agent-scene.lazy.tsx) imports only this
   file, so the scene and its large CSS module stay out of the first load of the page. */
export type SceneLocale = "de" | "en";

export const SCENE_LABEL = {
  de: "Illustration: Der MD-Agent pflanzt einen Samen und gießt ihn. Daraus wächst eine Mindmap, deren Knoten nacheinander aufblühen.",
  en: "Illustration: The MD agent plants a seed and waters it. A mind map grows from it, and its nodes bloom one after another.",
} as const;

export const SCENE_FILE = { de: "strategie.md", en: "strategy.md" } as const;

/* The finished map as an image, for browsers without JavaScript (<noscript>). Screenshots of the stage in the
   reduced-motion end state: wide 1240 × 546 (1440 px viewport), tall 700 × 916 (390 px viewport, 2×).
   Regenerate them when the end image of the scene changes. */
export const SCENE_END_IMAGE = {
  wide: { de: "/agents/bloom-scene-end-wide-de.webp", en: "/agents/bloom-scene-end-wide-en.webp", width: 1240, height: 546 },
  tall: { de: "/agents/bloom-scene-end-tall-de.webp", en: "/agents/bloom-scene-end-tall-en.webp", width: 700, height: 916 },
} as const;
