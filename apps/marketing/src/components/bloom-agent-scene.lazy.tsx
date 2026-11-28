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
   and its large CSS module) is an own chunk and loads only when the card comes within 300 px of the viewport.
   300 px, not 800: on a 900 px desktop the card of /en is about 590 px below the fold, so 800 px loaded the
   scene in the first load and took the LCP. An observer (not "load on the first scroll") also loads the scene
   on a tall screen where the card is visible at once, and after a jump by anchor or keyboard. The scene starts
   only when it comes within 25 % of the viewport, so 300 px still leaves time for the chunk.
   So it is not part of the HTML and the critical CSS of the first load (LCP). Without JavaScript the card
   shows the finished map as an image. Reduced motion: the scene itself shows its static final image.
   Until the scene is there, the stage is one image with the scene label (role="img"); the noscript image in it
   has an empty alt, so it is not announced a second time. If the chunk fails to load, the stage
   shows the same end image (with its alt text) in the same box: no layout shift, no unhandled rejection. */
export function BloomAgentSceneLazy({ locale }: { locale: SceneLocale }) {
  const ref = useRef<HTMLDivElement>(null);
  const [Scene, setScene] = useState<Scene | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (loadedScene) {
      setScene(() => loadedScene);
      return;
    }
    const node = ref.current;
    if (!node) return;
    let cancelled = false;
    const load = () => {
      import("./bloom-agent-scene").then(
        (module) => {
          loadedScene = module.BloomAgentScene;
          if (!cancelled) setScene(() => module.BloomAgentScene);
        },
        () => {
          // Offline or a stale deployment: keep the card and show the finished map as an image.
          if (!cancelled) setFailed(true);
        },
      );
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
    }, { rootMargin: "300px 0px" });
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
      {failed ? (
        <div className={shell.stage}>
          <EndImage locale={locale} alt={SCENE_LABEL[locale]} />
        </div>
      ) : (
        <div className={shell.stage} role="img" aria-label={SCENE_LABEL[locale]}>
          <noscript>
            <EndImage locale={locale} alt="" />
          </noscript>
        </div>
      )}
    </div>
  );
}

/* The finished map: the wide or the tall end image, it fills the stage. */
function EndImage({ locale, alt }: { locale: SceneLocale; alt: string }) {
  return (
    <picture>
      <source media={WIDE_MEDIA} srcSet={SCENE_END_IMAGE.wide[locale]} width={SCENE_END_IMAGE.wide.width} height={SCENE_END_IMAGE.wide.height} />
      <img
        src={SCENE_END_IMAGE.tall[locale]}
        alt={alt}
        width={SCENE_END_IMAGE.tall.width}
        height={SCENE_END_IMAGE.tall.height}
        loading="lazy"
        decoding="async"
        className={shell.endImage}
        data-testid="bloom-agent-scene-end-image"
      />
    </picture>
  );
}
