import shell from "./bloom-agent-scene.shell.module.css";
import { SCENE_END_IMAGE, type SceneLocale } from "./bloom-agent-scene.data";

/* Same query as the wide stage in the CSS modules. */
const WIDE_MEDIA = "(min-width: 720px), (min-aspect-ratio: 1/1)";

/* The finished map: the wide or the tall end image, it fills the stage. Used without JS (noscript), when the
   scene chunk fails, and by the scene when the avatar image fails or hangs. */
export function EndImage({ locale, alt }: { locale: SceneLocale; alt: string }) {
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
