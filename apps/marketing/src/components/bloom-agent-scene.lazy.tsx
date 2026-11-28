"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import shell from "./bloom-agent-scene.shell.module.css";
import { SCENE_END_IMAGE, SCENE_FILE, SCENE_LABEL, type SceneLocale } from "./bloom-agent-scene.data";

type Scene = ComponentType<{ locale: SceneLocale }>;

/* Same query as the wide stage in the CSS modules. */
const WIDE_MEDIA = "(min-width: 720px), (min-aspect-ratio: 1/1)";

/* Loaded once per page view; on a client navigation back the scene renders at once. */
let loadedScene: Scene | null = null;

/* The server render is only the empty card: box, tab bar with the file name and the stage size come from the
   small shell module, so the card has the final size and the swap shifts no layout. The scene (markup, SVG
   and its large CSS module) is an own chunk and loads only when the card comes within 800 px of the viewport.
   So it is not part of the HTML and the critical CSS of the first load (LCP). Without JavaScript the card
   shows the finished map as an image. Reduced motion: the scene itself shows its static final image. */
export function BloomAgentSceneLazy({ locale }: { locale: SceneLocale }) {
  const ref = useRef<HTMLDivElement>(null);
  const [Scene, setScene] = useState<Scene | null>(null);

  useEffect(() => {
    if (loadedScene) {
      setScene(() => loadedScene);
      return;
    }
    const node = ref.current;
    if (!node) return;
    let cancelled = false;
    const load = () => {
      void import("./bloom-agent-scene").then((module) => {
        loadedScene = module.BloomAgentScene;
        if (!cancelled) setScene(() => module.BloomAgentScene);
      });
    };
    if (!("IntersectionObserver" in window)) {
      load();
      return () => {
        cancelled = true;
      };
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      load();
    }, { rootMargin: "800px 0px" });
    observer.observe(node);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, []);

  if (Scene) return <Scene locale={locale} />;

  return (
    <div ref={ref} className={shell.scene} data-testid="bloom-agent-scene" data-card>
      <div className={shell.bar}>
        <span className={shell.file}>
          <svg viewBox="0 0 12 14" className={shell.fileIcon} aria-hidden="true" focusable="false">
            <path d="M1.5 1.5 h5.5 l3.5 3.5 v7.5 h-9 z M7 1.5 v3.5 h3.5" />
          </svg>
          {SCENE_FILE[locale]}
        </span>
      </div>
      <div className={shell.stage}>
        <noscript>
          <picture>
            <source media={WIDE_MEDIA} srcSet={SCENE_END_IMAGE.wide[locale]} width={SCENE_END_IMAGE.wide.width} height={SCENE_END_IMAGE.wide.height} />
            <img
              src={SCENE_END_IMAGE.tall[locale]}
              alt={SCENE_LABEL[locale]}
              width={SCENE_END_IMAGE.tall.width}
              height={SCENE_END_IMAGE.tall.height}
              loading="lazy"
              decoding="async"
              className={shell.endImage}
              data-testid="bloom-agent-scene-end-image"
            />
          </picture>
        </noscript>
      </div>
    </div>
  );
}
