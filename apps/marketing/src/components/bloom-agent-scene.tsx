"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type FocusEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Pause, Play } from "lucide-react";
import styles from "./bloom-agent-scene.module.css";

type Locale = "de" | "en";

/* end: static final image (server render, no JS, reduced motion). ready: before the scene starts.
   play: one-shot scene, then a calm final image (only the agent floats). idle: scene already played in this
   page view (client navigation back), final image with the float. stopped: paused by the user, no motion. */
type SceneState = "end" | "ready" | "play" | "idle" | "stopped";

/* The scene plays once per page view. The flag lives in memory only: no browser storage, no cookie,
   so the privacy and cookie texts stay true. After a reload the scene plays again. */
let playedInThisPageView = false;

const copy = {
  de: {
    label: "Illustration: Der MD-Agent pflanzt einen Samen und gießt ihn. Daraus wächst eine Mindmap, deren Knoten nacheinander aufblühen.",
    pause: "Animation anhalten",
    play: "Animation abspielen",
    agent: "MD-Agent hüpfen lassen",
    node: (title: string) => `Knoten „${title}“ aufblühen lassen`,
  },
  en: {
    label: "Illustration: The MD agent plants a seed and waters it. A mind map grows from it, and its nodes bloom one after another.",
    pause: "Pause animation",
    play: "Play animation",
    agent: "Make the MD agent hop",
    node: (title: string) => `Make the “${title}” node bloom`,
  },
} as const;

/* Avatar layers: the same image, clipped into head, body and hands (geometry of the avatar, in percent).
   md-avatar-400.webp is the same crop as md-avatar-200.webp at twice the resolution, for the larger stage. */
const AVATAR_SRC = "/agents/md-avatar-200.webp";
const AVATAR_SRCSET = "/agents/md-avatar-200.webp 200w, /agents/md-avatar-400.webp 400w";
/* Phones in portrait take the 200 px file (as before); only the wide stage takes the 400 px file.
   The wide stage shows from 720 px and on every landscape viewport (same query as the CSS module). */
const AVATAR_SIZES = "(min-width: 720px) 240px, (min-aspect-ratio: 1/1) 240px, 110px";
const clip = {
  head: "polygon(0% 0%, 100% 0%, 100% 49.04%, 80% 54.02%, 71% 55.75%, 56% 56.7%, 50% 57.28%, 43.5% 57.47%, 37.5% 57.66%, 31% 57.28%, 22.5% 54.79%, 0% 51.72%)",
  body: "polygon(31% 100%, 31% 71.26%, 36% 62.84%, 39.5% 59.39%, 43.5% 56.7%, 47% 55.56%, 50.5% 55.36%, 54% 55.75%, 56.5% 56.7%, 61% 59%, 65.5% 63.22%, 72.5% 72.8%, 72.5% 100%)",
  handL: "polygon(10% 66.28%, 31% 66.28%, 31% 85.82%, 10% 85.82%)",
  handR: "polygon(73% 62.84%, 92.5% 62.84%, 92.5% 81.23%, 73% 81.23%)",
};

/* near: the scene is close to the viewport. Only then the avatar image is requested, so it never competes
   with the LCP element of the page (native lazy loading starts far earlier). Without JS the image comes
   from <noscript>, so the server render stays the complete final image. */
function Layer({ part, near }: { part: keyof typeof clip; near: boolean }) {
  const image = <img src={AVATAR_SRC} srcSet={AVATAR_SRCSET} sizes={AVATAR_SIZES} alt="" width={200} height={261} loading="lazy" decoding="async" draggable={false} className={styles.layer} style={{ clipPath: clip[part] }} />;
  return near ? image : <noscript>{image}</noscript>;
}

/* Node titles: the "Produktstrategie" / "Product strategy" example map that the landing page already shows
   (useCases[0].file and .markdown in app/page.tsx and app/en/english-landing-page.tsx). No new claims.
   The hierarchy is the one of that Markdown: # root, ## children, ### leaves under the second child. */
const MAP = {
  de: { file: "strategie.md", root: "Strategie", children: ["Ziele", "Initiativen"], leaves: ["Kundenbindung", "Startrisiko"] },
  en: { file: "strategy.md", root: "Product Strategy", children: ["Goals", "Initiatives"], leaves: ["Retention", "Launch risk"] },
} as const;

/* Two stages with the same story. "wide" from 720 px and on every landscape viewport: a broad stage, the
   map spreads to the right of the agent. "tall" on narrower portrait viewports: a portrait stage, the root at the top and the stem grows the full height.
   Only one of them is displayed (CSS media query), so there is no layout shift and no JS decision.
   The avatar box is in viewBox units; seed, can drops and the toss follow from it.
   Keep .stage aspect ratios and the avatar vars in the CSS module in sync with W and H. */
type Point = readonly [number, number];
type Cubic = readonly [Point, Point, Point, Point];

type Layout = {
  W: number;
  H: number;
  ground: number;
  avatar: { x: number; w: number };
  root: { cx: number; cy: number; h: number; font: number; pad: number };
  child: { cx: readonly [number, number]; cy: number; h: number; font: number; pad: number };
  leaf: { x: number; h: number; cy: readonly [number, number]; font: number };
  /* Stem from the seed to the root as cubic segments; leaves sit on [segment, t]. */
  stem: (seed: Point, rootBottom: Point) => Cubic[];
  stemLeaves: readonly [readonly [number, number], readonly [number, number]];
  spark: number;
};

const LAYOUTS: Record<"wide" | "tall", Layout> = {
  wide: {
    W: 1000,
    H: 440,
    ground: 404,
    avatar: { x: 30, w: 196 },
    root: { cx: 556, cy: 204, h: 64, font: 25, pad: 30 },
    child: { cx: [330, 800], cy: 84, h: 54, font: 20, pad: 26 },
    leaf: { x: 784, h: 48, cy: [270, 340], font: 17 },
    stem: ([sx, sy], [rx, ry]) => [[[sx, sy], [sx, sy - 70], [rx, ry + 80], [rx, ry]]],
    stemLeaves: [[0, 0.2], [0, 0.52]],
    spark: 1.55,
  },
  tall: {
    W: 360,
    H: 470,
    ground: 440,
    avatar: { x: 4, w: 138 },
    root: { cx: 180, cy: 64, h: 52, font: 19.5, pad: 22 },
    child: { cx: [84, 270], cy: 172, h: 44, font: 15.5, pad: 18 },
    /* x 196: the twig from "Initiativen" reaches the leaf on the left of the pill, not behind it. */
    leaf: { x: 196, h: 40, cy: [264, 320], font: 13.5 },
    /* A gentle S: left over the hand of the agent, back through the gap between the children, up into the root. */
    stem: ([sx, sy], [rx, ry]) => [
      [[sx, sy], [sx, sy - 44], [146, 372], [146, 318]],
      [[146, 318], [146, 264], [170, 230], [170, 176]],
      [[170, 176], [170, 140], [rx, ry + 30], [rx, ry]],
    ],
    stemLeaves: [[0, 0.62], [1, 0.45]],
    spark: 1,
  },
};

/* Beats of the scene in seconds. The CSS module reads them as custom properties (--t-*), so the sparks
   in the markup and the keyframes in the CSS keep the same timeline. The agent tracks run 4.8 s: the scene
   is calm before 5 s. The phases overlap (the next one starts while the last one settles). */
const T = { root: 1.72, child: 2.2, leaf: 2.68, shine: 3, cheer: 3.82 } as const;
const timeline = Object.fromEntries(Object.entries(T).map(([key, value]) => [`--t-${key}`, `${value}s`])) as CSSProperties;

/* Avatar geometry: 200 × 261. Spout tip of the tilted can and the toss point, as a share of the avatar box. */
const AV_RATIO = 261 / 200;
const SPOUT = { x: 1.285, y: 0.86 };
const SEED_AT = 1.29;
/* Old card scale: the CSS keyframes of the seed toss are written for an avatar 118.8 units wide. */
const BASE_AVATAR_W = 118.8;

/* Text width estimate in em, on the wide side, so the pill fits any sans-serif fallback (system-ui differs
   per OS). The pill is centred around its text, so a narrower font only adds a little air on both sides. */
function textWidth(text: string, font: number, weight = 1) {
  let em = 0;
  for (const char of text) {
    if ("iljtfrI.,' ".includes(char)) em += 0.34;
    else if ("mwMW".includes(char)) em += 0.9;
    else if (char === "#") em += 0.62;
    else if (char === char.toUpperCase()) em += 0.7;
    else em += 0.58;
  }
  return em * font * weight * 1.06;
}

function geometry(layout: Layout, locale: Locale) {
  const { W, H, ground, avatar, root, child, leaf } = layout;
  const map = MAP[locale];
  const avH = avatar.w * AV_RATIO;
  const avY = ground + 4 - avH;
  const seed = { x: Math.round(avatar.x + SEED_AT * avatar.w), y: ground - 1 };
  const drop = { x: avatar.x + SPOUT.x * avatar.w, y: avY + SPOUT.y * avH };
  const markGap = (font: number) => font * 0.42;
  const rootW = Math.round(2 * root.pad + textWidth("#", root.font * 0.78) + markGap(root.font) + textWidth(map.root, root.font, 1.05));
  const childW = map.children.map((title) => Math.round(2 * child.pad + textWidth("##", child.font * 0.72) + markGap(child.font) + textWidth(title, child.font, 1.02)));
  const dot = { x: leaf.h * 0.46, gap: leaf.font * 0.75 };
  const leafW = Math.round(dot.x + dot.gap + Math.max(...map.leaves.map((title) => textWidth(title, leaf.font))) + leaf.h * 0.42);
  return {
    W, H, avH, avY, seed, drop, markGap,
    rootW, rootX: root.cx - rootW / 2, rootY: root.cy - root.h / 2,
    childW, childTop: child.cy - child.h / 2, childBottom: child.cy + child.h / 2,
    leafW, dot,
    u: avatar.w / BASE_AVATAR_W,
  };
}

/* The five nodes of a stage in Markdown order (root, children, leaves): centre and size in viewBox units.
   The SVG draws them, the HTML buttons on top of the stage use the same boxes. */
type NodeBox = { cx: number; cy: number; w: number; h: number; kind: "root" | "child" | "leaf" };
function nodeBoxes(layout: Layout, locale: Locale): NodeBox[] {
  const g = geometry(layout, locale);
  const { root, child, leaf } = layout;
  return [
    { cx: root.cx, cy: root.cy, w: g.rootW, h: root.h, kind: "root" },
    ...child.cx.map((cx, index) => ({ cx, cy: child.cy, w: g.childW[index]!, h: child.h, kind: "child" as const })),
    ...leaf.cy.map((cy) => ({ cx: leaf.x + g.leafW / 2, cy, w: g.leafW, h: leaf.h, kind: "leaf" as const })),
  ];
}

/* Petals for the bloom on a click: a fan out of the upper edge of the node. Rendered only with motion. */
function Petals({ box, s }: { box: NodeBox; s: number }) {
  return (
    <g className={`${styles.petals} ${box.kind === "leaf" ? styles.petalsLeaf : ""}`} aria-hidden="true">
      {Array.from({ length: 7 }, (_, index) => {
        const deg = -168 + index * 26;
        const angle = (deg * Math.PI) / 180;
        const x = box.cx + Math.cos(angle) * box.w * 0.42;
        const y = box.cy + Math.sin(angle) * box.h * 0.5;
        const reach = (20 + (index % 3) * 7) * s;
        const style = {
          "--px": `${Math.round(Math.cos(angle) * reach)}px`,
          "--py": `${Math.round(Math.sin(angle) * reach - 6 * s)}px`,
          "--pr": `${deg + 90}deg`,
        } as CSSProperties;
        return <ellipse key={index} cx={r1(x)} cy={r1(y)} rx={r1(2.6 * s)} ry={r1(5.2 * s)} className={styles.petal} style={style} />;
      })}
    </g>
  );
}

/* A point on a cubic Bézier, for leaves along the stem and forks of the twigs. */
function bez([p0, p1, p2, p3]: Cubic, t: number): Point {
  const m = 1 - t;
  const at = (axis: 0 | 1) => m * m * m * p0[axis] + 3 * m * m * t * p1[axis] + 3 * m * t * t * p2[axis] + t * t * t * p3[axis];
  return [at(0), at(1)];
}
const cubicPath = (segments: readonly Cubic[]) => `M${segments[0]![0].join(" ")}${segments.map(([, a, b, c]) => ` C${a.join(" ")} ${b.join(" ")} ${c.join(" ")}`).join("")}`;
const r1 = (value: number) => Math.round(value * 10) / 10;

/* Deterministic sparks: a fan that rises from a burst point. */
function Sparks({ x, y, delay, count = 8, spread = 1, rise = 1, scale = 1, ring = false }: { x: number; y: number; delay: number; count?: number; spread?: number; rise?: number; scale?: number; ring?: boolean }) {
  return (
    <g className={styles.burst} style={{ "--d": `${delay}s` } as CSSProperties} aria-hidden="true">
      {ring ? <circle cx={x} cy={y} r={14 * scale} className={styles.ring} /> : null}
      {Array.from({ length: count }, (_, index) => {
        const angle = ((-90 + (index - (count - 1) / 2) * (150 / count) * spread) * Math.PI) / 180;
        const reach = (24 + (index % 3) * 9) * rise * scale;
        const style = {
          "--dx": `${Math.round(Math.cos(angle) * reach)}px`,
          "--dy": `${Math.round(Math.sin(angle) * reach - 10 * rise * scale)}px`,
          "--k": index % 4,
        } as CSSProperties;
        return <circle key={index} cx={x} cy={y} r={(index % 3 === 0 ? 2.6 : 1.8) * scale} className={styles.spark} style={style} />;
      })}
    </g>
  );
}

/* A small watering can, drawn in the hand of the agent. Spout tip at (39, 4) of its 42 × 28 box. */
function WateringCan() {
  return (
    <svg className={styles.can} viewBox="0 0 42 28" aria-hidden="true" focusable="false">
      <path d="M4 9 C-1 9 -1 21 5 21" className={styles.canHandle} />
      <path d="M26 16 L39 5" className={styles.canSpout} />
      <path d="M37 2.5 l4.5 4.5" className={styles.canRose} />
      <rect x="5" y="8" width="23" height="18" rx="5" className={styles.canBody} />
      <rect x="9" y="12" width="15" height="3" rx="1.5" className={styles.canBand} />
    </svg>
  );
}

/* Everything behind the agent: light, ground, stem, branches, nodes and their sparks.
   live: motion is allowed. Only then the parts that are invisible in the final image are rendered
   (ghost outline, sparks, flow pulses, ripple, bud). The server render stays small, the final image is the same. */
function MapBack({ kind, locale, live }: { kind: "wide" | "tall"; locale: Locale; live: boolean }) {
  const layout = LAYOUTS[kind];
  const map = MAP[locale];
  const g = geometry(layout, locale);
  const { root, child, leaf, ground, spark } = layout;
  const id = (name: string) => `bloom-${kind}-${name}`;
  const s = kind === "wide" ? 1.6 : 1.05;
  const rootBottom = g.rootY + root.h;
  const boxes = nodeBoxes(layout, locale);

  const stemSegments = layout.stem([g.seed.x, g.seed.y + 2], [root.cx, rootBottom - 4]);
  const stem = cubicPath(stemSegments);
  const [ax, ay] = bez(stemSegments[layout.stemLeaves[0][0]]!, layout.stemLeaves[0][1]);
  const [bx, by] = bez(stemSegments[layout.stemLeaves[1][0]]!, layout.stemLeaves[1][1]);

  /* Branches root → children. Wide: out of the top of the root, sweeping into the inner end of each child.
     Tall: out of the bottom of the root, down into the top of each child. */
  const edges = child.cx.map((cx, index) => {
    const side = index === 0 ? -1 : 1;
    const w = g.childW[index]!;
    if (kind === "wide") {
      const sx = root.cx + side * (g.rootW / 2 - 34);
      const ex = cx - side * (w / 2 - 2);
      return `M${sx} ${g.rootY + 4} C${sx} ${child.cy + 18} ${ex - side * 70} ${child.cy} ${ex} ${child.cy}`;
    }
    const sx = root.cx + side * Math.min(g.rootW / 2 - 34, 58);
    return `M${sx} ${rootBottom - 4} C${sx} ${rootBottom + 34} ${cx} ${g.childTop - 40} ${cx} ${g.childTop + 2}`;
  });
  /* Twigs child → leaves: one twig leaves the second child and sweeps into the first leaf,
     the second forks off that twig, like a branch. */
  const iw = g.childW[1]!;
  const tx = child.cx[1] - iw / 2 + (kind === "wide" ? 44 : 28);
  const ty = g.childBottom - 3;
  const lead = kind === "wide" ? 40 : 24;
  const twig0: Cubic = [[tx, ty], [tx - (kind === "wide" ? 12 * s : 14), ty + (leaf.cy[0] - ty) * 0.55], [leaf.x - lead, leaf.cy[0]], [leaf.x + 2, leaf.cy[0]]];
  /* The fork leaves twig0 along its tangent, so the branch has no corner. */
  const forkT = 0.42;
  const fork = bez(twig0, forkT);
  const ahead = bez(twig0, forkT + 0.02);
  const reach = (leaf.cy[1] - fork[1]) * 0.45;
  const norm = Math.hypot(ahead[0] - fork[0], ahead[1] - fork[1]) || 1;
  const twig1: Cubic = [fork, [fork[0] + ((ahead[0] - fork[0]) / norm) * reach, fork[1] + ((ahead[1] - fork[1]) / norm) * reach], [leaf.x - lead * 1.2, leaf.cy[1]], [leaf.x + 2, leaf.cy[1]]];
  const twigs = [twig0, twig1].map((cubic) => cubicPath([cubic.map(([x, y]) => [r1(x), r1(y)] as const) as unknown as Cubic]));

  return (
    <svg className={`${styles.map} ${styles[kind]}`} viewBox={`0 0 ${g.W} ${g.H}`} style={{ "--u": g.u } as CSSProperties} aria-hidden="true" focusable="false" data-bloom-stage={kind}>
      <defs>
        <radialGradient id={id("glow")}>
          <stop offset="0" stopColor="#FF6B35" stopOpacity="0.3" />
          <stop offset="0.55" stopColor="#FF6B35" stopOpacity="0.08" />
          <stop offset="1" stopColor="#FF6B35" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("seedglow")}>
          <stop offset="0" stopColor="#FFD27A" stopOpacity="0.9" />
          <stop offset="0.45" stopColor="#FF8A5C" stopOpacity="0.35" />
          <stop offset="1" stopColor="#FF6B35" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("soil")} cy="0.2" r="0.6">
          <stop offset="0" stopColor="#FF8A5C" stopOpacity="0.2" />
          <stop offset="1" stopColor="#FF8A5C" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("ground")} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.3" stopColor="#fff" stopOpacity="0.1" />
          <stop offset="0.7" stopColor="#fff" stopOpacity="0.1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id("root")} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#FF9364" />
          <stop offset="1" stopColor="#F2561F" />
        </linearGradient>
        <linearGradient id={id("child")} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#3A3430" />
          <stop offset="1" stopColor="#272321" />
        </linearGradient>
        <linearGradient id={id("leaf")} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2F3A2B" />
          <stop offset="1" stopColor="#222821" />
        </linearGradient>
      </defs>
      <ellipse cx={root.cx} cy={root.cy} rx={kind === "wide" ? 420 : 230} ry={260} fill={`url(#${id("glow")})`} className={styles.glow} />
      <ellipse cx={g.W / 2} cy={ground + 4} rx={g.W * 0.48} ry={kind === "wide" ? 40 : 28} fill={`url(#${id("soil")})`} />
      <path d={`M${g.W * 0.03} ${ground + 0.5} H${g.W * 0.97}`} stroke={`url(#${id("ground")})`} className={styles.ground} />

      <ellipse cx={layout.avatar.x + layout.avatar.w * 0.6} cy={ground + 3} rx={layout.avatar.w * 0.3} ry={4 * s} className={styles.shadow} />
      <ellipse cx={g.seed.x} cy={ground + 1} rx={24 * s} ry={4.5 * s} className={styles.soil} />
      <circle cx={g.seed.x} cy={g.seed.y - 3} r={30 * s} fill={`url(#${id("seedglow")})`} className={styles.seedGlow} />
      {live ? <ellipse cx={g.seed.x} cy={ground} rx={20 * s} ry={5 * s} className={styles.ripple} data-bloom-ripple /> : null}

      {/* Ghost outline of the map before it grows: the stage is never an empty card. Each part fades
          out when its real node blooms. */}
      {live ? (
        <g className={styles.ghost} data-bloom-ghost>
          <path d={stem} className={`${styles.ghostLine} ${styles.ghostStem}`} />
          {[...edges, ...twigs].map((d) => <path key={d} d={d} className={styles.ghostLine} />)}
          <rect x={g.rootX} y={g.rootY} width={g.rootW} height={root.h} rx={root.h / 2} className={`${styles.ghostNode} ${styles.ghostRoot}`} />
          {child.cx.map((cx, index) => (
            <rect key={cx} x={cx - g.childW[index]! / 2} y={g.childTop} width={g.childW[index]} height={child.h} rx={child.h / 2} className={`${styles.ghostNode} ${styles.ghostChild}`} style={{ "--i": index } as CSSProperties} />
          ))}
          {leaf.cy.map((cy, index) => (
            <rect key={cy} x={leaf.x} y={cy - leaf.h / 2} width={g.leafW} height={leaf.h} rx={leaf.h / 2} className={`${styles.ghostNode} ${styles.ghostLeaf}`} style={{ "--i": index } as CSSProperties} />
          ))}
        </g>
      ) : null}

      <path d={stem} pathLength={1} className={`${styles.stemHalo} ${styles.draw}`} />
      <path d={stem} pathLength={1} className={`${styles.stem} ${styles.draw}`} />
      <path d={`M${r1(ax + 1)} ${r1(ay)} c${15 * s} ${-1 * s} ${23 * s} ${-9 * s} ${24 * s} ${-19 * s} c${-11 * s} ${-1 * s} ${-21 * s} ${6 * s} ${-24 * s} ${19 * s} z`} className={`${styles.leaf} ${styles.leafA}`} />
      <path d={`M${r1(bx - 1)} ${r1(by)} c${-13 * s} ${-7 * s} ${-25 * s} ${-6 * s} ${-30 * s} ${1 * s} c${9 * s} ${7 * s} ${22 * s} ${7 * s} ${30 * s} ${-1 * s} z`} className={`${styles.leaf} ${styles.leafB}`} />
      {/* The bud on the tip of the stem: two sepals around an orange core. It swells, gathers itself and
          opens; the root node grows out of it (transform-origin at its bottom centre). */}
      {live ? (
        <g className={styles.bud} data-bloom-bud>
          <ellipse cx={root.cx} cy={r1(rootBottom - 6 * s)} rx={r1(6 * s)} ry={r1(11 * s)} className={styles.budCore} />
          {[-1, 1].map((side) => (
            <path
              key={side}
              d={`M${root.cx} ${r1(rootBottom + 6 * s)} C${r1(root.cx + side * 13 * s)} ${r1(rootBottom)} ${r1(root.cx + side * 12 * s)} ${r1(rootBottom - 14 * s)} ${r1(root.cx + side * 1 * s)} ${r1(rootBottom - 21 * s)} C${r1(root.cx + side * 4 * s)} ${r1(rootBottom - 12 * s)} ${r1(root.cx + side * 3 * s)} ${r1(rootBottom - 2 * s)} ${root.cx} ${r1(rootBottom + 6 * s)} z`}
              className={`${styles.sepal} ${side < 0 ? styles.sepalL : styles.sepalR}`}
            />
          ))}
        </g>
      ) : null}

      {edges.map((d, index) => (
        <g key={d} style={{ "--i": index } as CSSProperties}>
          <path d={d} pathLength={1} className={`${styles.edge} ${styles.halo} ${styles.draw}`} />
          <path d={d} pathLength={1} className={`${styles.edge} ${styles.draw}`} />
          {live ? <path d={d} pathLength={1} className={styles.flow} data-bloom-flow /> : null}
        </g>
      ))}
      {twigs.map((d, index) => (
        <g key={d} style={{ "--i": index } as CSSProperties}>
          <path d={d} pathLength={1} className={`${styles.edge} ${styles.twig} ${styles.halo} ${styles.draw}`} />
          <path d={d} pathLength={1} className={`${styles.edge} ${styles.twig} ${styles.draw}`} />
          {live ? <path d={d} pathLength={1} className={`${styles.flow} ${styles.flowTwig}`} data-bloom-flow /> : null}
        </g>
      ))}

      {/* Sparks only at the two key moments: the root bursts open (behind the node, with one ring) and the
          cheer. The children and leaves pop with a spring alone, so the stage stays clean. */}
      {/* The root opens with its ring and its petals (see Petals below), no confetti sparks. */}
      {live ? <Sparks x={root.cx} y={g.rootY} delay={T.root + 0.02} count={0} rise={1.2} scale={spark} ring /> : null}

      <g className={styles.nodeWrap} data-bloom-wrap={0}>
      <g className={styles.rootNode} data-bloom-node="root">
        <g className={styles.pop}>
        <rect x={g.rootX} y={g.rootY} width={g.rootW} height={root.h} rx={root.h / 2} fill={`url(#${id("root")})`} className={styles.rootRect} />
        <rect x={g.rootX + 1} y={g.rootY + 1} width={g.rootW - 2} height={root.h - 2} rx={root.h / 2 - 1} className={styles.rootRim} />
        <text x={root.cx} y={root.cy + root.font * 0.36} textAnchor="middle" className={styles.rootTitle} style={{ fontSize: root.font }}>
          <tspan className={styles.rootMark} style={{ fontSize: root.font * 0.78 }}>#</tspan>
          <tspan dx={g.markGap(root.font)} data-bloom-title>{map.root}</tspan>
        </text>
        </g>
      </g>
      {live ? <Petals box={boxes[0]!} s={s} /> : null}
      </g>

      {child.cx.map((cx, index) => {
        const w = g.childW[index]!;
        return (
          <g key={`node-${cx}`} className={styles.nodeWrap} data-bloom-wrap={1 + index}>
          <g className={styles.childNode} style={{ "--i": index, "--o": kind === "wide" ? (index === 0 ? "100% 50%" : "0% 50%") : "50% 0%" } as CSSProperties} data-bloom-node="child">
            <g className={styles.pop}>
            <rect x={cx - w / 2} y={g.childTop} width={w} height={child.h} rx={child.h / 2} fill={`url(#${id("child")})`} className={styles.childRect} />
            <text x={cx} y={child.cy + child.font * 0.36} textAnchor="middle" className={styles.childTitle} style={{ fontSize: child.font }}>
              <tspan className={styles.childMark} style={{ fontSize: child.font * 0.72 }}>##</tspan>
              <tspan dx={g.markGap(child.font)} data-bloom-title>{map.children[index]}</tspan>
            </text>
            </g>
          </g>
          {live ? <Petals box={boxes[1 + index]!} s={s} /> : null}
          </g>
        );
      })}

      {leaf.cy.map((cy, index) => (
        <g key={`leaf-${cy}`} className={styles.nodeWrap} data-bloom-wrap={3 + index}>
        <g className={styles.leafNode} style={{ "--i": index } as CSSProperties} data-bloom-node="leaf">
          <g className={styles.pop}>
          <rect x={leaf.x} y={cy - leaf.h / 2} width={g.leafW} height={leaf.h} rx={leaf.h / 2} fill={`url(#${id("leaf")})`} className={styles.leafRect} />
          <circle cx={leaf.x + g.dot.x} cy={cy} r={kind === "wide" ? 4.2 : 3.4} className={styles.leafDot} />
          <text x={leaf.x + g.dot.x + g.dot.gap} y={cy + leaf.font * 0.35} className={styles.leafTitle} style={{ fontSize: leaf.font }}>
            <tspan data-bloom-title>{map.leaves[index]}</tspan>
          </text>
          </g>
        </g>
        {live ? <Petals box={boxes[3 + index]!} s={s} /> : null}
        </g>
      ))}

    </svg>
  );
}

/* In front of the agent: the water, the seed and the cheer sparks. Water and sparks only with motion. */
function MapFront({ kind, live }: { kind: "wide" | "tall"; live: boolean }) {
  const layout = LAYOUTS[kind];
  const g = geometry(layout, "de");
  const s = kind === "wide" ? 1.6 : 1.05;
  /* The water falls from the spout onto the seed: a dashed stream (stroke-dashoffset) and drops. */
  const fall = { dx: g.seed.x - g.drop.x, dy: g.seed.y - 4 * s - g.drop.y };
  const stream = `M${r1(g.drop.x)} ${r1(g.drop.y)} q${r1(fall.dx * 0.15)} ${r1(fall.dy * 0.1)} ${r1(fall.dx)} ${r1(fall.dy)}`;
  return (
    <svg className={`${styles.map} ${styles[kind]}`} viewBox={`0 0 ${g.W} ${g.H}`} style={{ "--u": g.u, "--fall-x": `${r1(fall.dx)}px`, "--fall-y": `${r1(fall.dy)}px` } as CSSProperties} aria-hidden="true" focusable="false">
      {live ? (
        <g data-bloom-water>
          <path d={stream} pathLength={1} className={styles.streamHalo} />
          <path d={stream} pathLength={1} className={styles.streamCore} />
          <path d={stream} pathLength={1} className={styles.stream} />
          {[0, 1, 2, 3, 4].map((index) => (
            <g key={index} transform={`translate(${r1(g.drop.x + ((index % 3) - 1) * 2 * s)} ${r1(g.drop.y)})`}>
              <g className={styles.drop} style={{ "--i": index } as CSSProperties}>
                <path d="M0 -3.4 C1.8 -0.6 2.4 0.6 2.4 1.4 a2.4 2.4 0 0 1 -4.8 0 C-2.4 0.6 -1.8 -0.6 0 -3.4 z" transform={`scale(${r1(s * (index % 2 ? 1.2 : 1.5))})`} />
              </g>
            </g>
          ))}
          <ellipse cx={g.seed.x} cy={g.seed.y - 1} rx={14 * s} ry={3.5 * s} className={styles.splash} />
        </g>
      ) : null}
      <g className={styles.seedFall}>
        {live ? <circle cx={g.seed.x} cy={g.seed.y - 4.5 * s} r={16 * s} fill={`url(#bloom-${kind}-seedglow)`} className={styles.seedHalo} /> : null}
        <g className={styles.seedSquash}>
          <ellipse cx={g.seed.x} cy={g.seed.y - 4.5 * s} rx={6 * s} ry={7.2 * s} className={styles.seed} />
          <ellipse cx={g.seed.x - 1.6 * s} cy={g.seed.y - 7 * s} rx={1.6 * s} ry={2.2 * s} className={styles.seedShine} />
        </g>
      </g>
      {/* Above the head (clear of the antenna) at the top of the jump. */}
      {live ? <Sparks x={layout.avatar.x + layout.avatar.w * 0.55} y={g.avY - g.avH * 0.3} delay={T.cheer} count={5} spread={2.2} rise={1.1} scale={layout.spark} /> : null}
    </svg>
  );
}

const pct = (value: number, of: number) => `${((value / of) * 100).toFixed(3)}%`;
const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

/* Cursor gaze only on devices with a real hover and a fine pointer (desktop). Head turn at most ±6°. */
const FINE_POINTER = "(hover: hover) and (pointer: fine)";
const LOOK_DEG = 6;
/* Durations of the click reactions (CSS: bloom-poke 0.56 s, bloom-pop 0.6 s) plus a margin, so the attribute never cuts the end. */
const REACT_MS = 700;
const LOOK_HOLD_MS = 900;

export function BloomAgentScene({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const map = MAP[locale];
  const titles = [map.root, ...map.children, ...map.leaves];
  const ref = useRef<HTMLDivElement>(null);
  const lookRef = useRef<HTMLSpanElement>(null);
  const eyesRef = useRef<HTMLSpanElement>(null);
  const [state, setState] = useState<SceneState>("end");
  /* Paused until the observer reports the scene in view, so no loop runs during the page load. */
  const [offscreen, setOffscreen] = useState(true);
  const [motion, setMotion] = useState(false);
  const [near, setNear] = useState(false);
  /* The buttons work only with JS: the server render keeps the avatar button disabled and has no node buttons. */
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    const node = ref.current;
    if (!node) return;
    if (!("IntersectionObserver" in window)) {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setNear(true);
      observer.disconnect();
    }, { rootMargin: "600px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = ref.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!node || reduce.matches || !("IntersectionObserver" in window)) return;
    setMotion(true);
    setState(playedInThisPageView ? "idle" : "ready");
    /* Start when half of what can be seen at all is visible: half of the scene, or half of the viewport
       when the scene is taller than the viewport (phones in landscape, 200 % zoom). A plain ratio of 0.5
       would never be reached there. The thresholds 0 / 0.25 / 0.5 are enough to catch both cases. */
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        setOffscreen(!entry.isIntersecting);
        const viewport = entry.rootBounds?.height ?? window.innerHeight;
        if (!entry.isIntersecting || entry.intersectionRect.height < 0.5 * Math.min(entry.boundingClientRect.height, viewport) - 1) continue;
        setState((current) => {
          if (current !== "ready") return current;
          playedInThisPageView = true;
          return "play";
        });
      }
    }, { threshold: [0, 0.25, 0.5] });
    observer.observe(node);
    const onReduce = () => {
      if (!reduce.matches) return;
      setMotion(false);
      setState("end");
    };
    reduce.addEventListener("change", onReduce);
    return () => {
      observer.disconnect();
      reduce.removeEventListener("change", onReduce);
    };
  }, []);

  /* Scroll coupling: where the scene crosses the viewport, in page pixels, for the CSS scroll timeline
     (animation-range). Measured on layout changes (ResizeObserver), never on scroll. */
  useEffect(() => {
    const node = ref.current;
    if (!node || !motion || !CSS.supports("animation-timeline: scroll()") || !CSS.supports("animation-range: 0px 1px")) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = node.getBoundingClientRect();
        const top = box.top + window.scrollY;
        node.style.setProperty("--scroll-from", `${Math.max(0, Math.round(top - window.innerHeight))}px`);
        node.style.setProperty("--scroll-to", `${Math.round(top + box.height)}px`);
        node.setAttribute("data-scroll", "");
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.documentElement);
    observer.observe(node);
    window.addEventListener("resize", measure, { passive: true });
    /* The scroll animations exist only near the viewport. Outside the range they would only hold their end
       values, but they would still count as running animations of the page. */
    const inview = new IntersectionObserver((entries) => {
      for (const entry of entries) node.toggleAttribute("data-inview", entry.isIntersecting);
    }, { rootMargin: "25% 0px" });
    inview.observe(node);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      inview.disconnect();
      window.removeEventListener("resize", measure);
      node.removeAttribute("data-scroll");
      node.removeAttribute("data-inview");
    };
  }, [motion]);

  /* "ready" counts as running: the scene starts by itself, so the button offers to stop it. */
  const running = state === "ready" || state === "play" || state === "idle";
  /* The moving parts (ghost, water, sparks, can, light) are built only near the viewport, like the agent
     image, so they add no work to the page load. */
  const live = motion && near;
  /* The gaze may move only while the scene runs and is in view. Pause and reduced motion stop it. */
  const lookable = live && running && !offscreen;

  /* Gaze: a damped follow (lerp per animation frame) towards a target in -1…1. The loop runs only while the
     gaze is still moving and stops by itself once it has settled. */
  const look = useRef({ x: 0, y: 0, tx: 0, ty: 0, frame: 0, hover: false, allowed: false, hold: 0 });
  const paint = useCallback(() => {
    const { x, y } = look.current;
    const still = Math.abs(x) < 0.001 && Math.abs(y) < 0.001;
    if (lookRef.current) lookRef.current.style.transform = still ? "" : `rotate(${(x * LOOK_DEG).toFixed(2)}deg)`;
    if (eyesRef.current) eyesRef.current.style.transform = still ? "" : `translate(${(x * 4).toFixed(2)}%, ${(y * 3).toFixed(2)}%)`;
  }, []);
  const step = useCallback(() => {
    const gaze = look.current;
    gaze.x += (gaze.tx - gaze.x) * 0.14;
    gaze.y += (gaze.ty - gaze.y) * 0.14;
    if (Math.abs(gaze.tx - gaze.x) < 0.002 && Math.abs(gaze.ty - gaze.y) < 0.002) {
      gaze.x = gaze.tx;
      gaze.y = gaze.ty;
      gaze.frame = 0;
    } else gaze.frame = requestAnimationFrame(step);
    paint();
  }, [paint]);
  const aim = useCallback((clientX: number, clientY: number) => {
    const gaze = look.current;
    const head = lookRef.current?.getBoundingClientRect();
    const stage = ref.current?.getBoundingClientRect();
    if (!gaze.allowed || !head || !stage) return;
    gaze.tx = clamp((clientX - (head.left + head.width / 2)) / (stage.width * 0.5), 1);
    gaze.ty = clamp((clientY - (head.top + head.height / 2)) / (stage.height * 0.5), 1);
    if (!gaze.frame) gaze.frame = requestAnimationFrame(step);
  }, [step]);
  const aimHome = useCallback(() => {
    const gaze = look.current;
    gaze.tx = 0;
    gaze.ty = 0;
    if (gaze.allowed && !gaze.frame) gaze.frame = requestAnimationFrame(step);
  }, [step]);
  const aimAt = useCallback((element: Element) => {
    const box = element.getBoundingClientRect();
    aim(box.left + box.width / 2, box.top + box.height / 2);
  }, [aim]);

  useEffect(() => {
    const gaze = look.current;
    gaze.allowed = lookable;
    if (lookable) return;
    cancelAnimationFrame(gaze.frame);
    window.clearTimeout(gaze.hold);
    Object.assign(gaze, { x: 0, y: 0, tx: 0, ty: 0, frame: 0 });
    paint();
  }, [lookable, paint]);
  useEffect(() => () => {
    cancelAnimationFrame(look.current.frame);
    window.clearTimeout(look.current.hold);
  }, []);

  /* Click reactions: the attribute is set again on every click, so the CSS animation restarts. */
  const timers = useRef(new Map<Element, number>());
  const flash = useCallback((element: Element | null | undefined, attribute: string) => {
    if (!element) return;
    window.clearTimeout(timers.current.get(element));
    element.removeAttribute(attribute);
    void (element as HTMLElement).getBoundingClientRect();
    element.setAttribute(attribute, "");
    timers.current.set(element, window.setTimeout(() => element.removeAttribute(attribute), REACT_MS));
  }, []);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const finePointer = (event: ReactPointerEvent) => event.pointerType === "mouse" && window.matchMedia(FINE_POINTER).matches;
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!finePointer(event)) return;
    look.current.hover = true;
    const nodeButton = (event.target as Element).closest("[data-bloom-hit]");
    if (nodeButton) aimAt(nodeButton);
    else aim(event.clientX, event.clientY);
  };
  const onPointerLeave = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    look.current.hover = false;
    aimHome();
  };
  const pokeAgent = () => flash(ref.current, "data-react");
  const bloomNode = (kind: "wide" | "tall", index: number, button: Element) => {
    flash(ref.current?.querySelector(`svg[data-bloom-stage="${kind}"] [data-bloom-wrap="${index}"]`), "data-pop");
    flash(ref.current, "data-react");
    /* The agent looks at the node, holds, and looks back (also on touch, where there is no cursor gaze). */
    aimAt(button);
    window.clearTimeout(look.current.hold);
    look.current.hold = window.setTimeout(() => {
      if (!look.current.hover) aimHome();
    }, LOOK_HOLD_MS);
  };
  const onNodeFocus = (event: FocusEvent<HTMLButtonElement>) => {
    if (event.currentTarget.matches(":focus-visible")) aimAt(event.currentTarget);
  };

  const toggle = () => {
    if (running) {
      setState("stopped");
      return;
    }
    setState("ready");
    requestAnimationFrame(() => requestAnimationFrame(() => setState("play")));
  };

  const avatarVars = Object.fromEntries(
    (["wide", "tall"] as const).flatMap((kind) => {
      const layout = LAYOUTS[kind];
      const g = geometry(layout, locale);
      return [
        [`--${kind}-left`, pct(layout.avatar.x, g.W)],
        [`--${kind}-top`, pct(g.avY, g.H)],
        [`--${kind}-width`, pct(layout.avatar.w, g.W)],
      ];
    }),
  ) as CSSProperties;

  return (
    <div
      ref={ref}
      className={styles.scene}
      style={timeline}
      data-state={state}
      data-offscreen={offscreen || undefined}
      data-testid="bloom-agent-scene"
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <div className={styles.bar}>
        <span className={styles.file} data-bloom-file>
          <svg viewBox="0 0 12 14" className={styles.fileIcon} aria-hidden="true" focusable="false">
            <path d="M1.5 1.5 h5.5 l3.5 3.5 v7.5 h-9 z M7 1.5 v3.5 h3.5" />
          </svg>
          {map.file}
        </span>
        {motion ? (
          <button type="button" className={styles.toggle} onClick={toggle} aria-label={running ? t.pause : t.play} data-testid="bloom-agent-scene-toggle">
            {running ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          </button>
        ) : null}
      </div>

      <div className={styles.stage} data-testid="bloom-agent-stage">
        {/* Parallax layer: map, agent and node buttons move together (≤ 24 px, CSS scroll timeline only),
            so the buttons stay on their nodes and the agent stays on the ground. */}
        <div className={styles.parallax} data-bloom-parallax>
        <div className={styles.art} role="img" aria-label={t.label}>
          <MapBack kind="wide" locale={locale} live={live} />
          <MapBack kind="tall" locale={locale} live={live} />
          {live ? <div className={styles.shine} aria-hidden="true" /> : null}
        </div>

        <button type="button" className={styles.avatar} style={avatarVars} aria-label={t.agent} disabled={!hydrated} onClick={pokeAgent} data-testid="bloom-agent-avatar">
          {/* Scroll pose: the agent follows the scroll through the section (CSS scroll timeline only). */}
          <span className={`${styles.part} ${styles.scrollPose}`} data-bloom-scroll-pose>
          <span className={styles.hop}>
            <span className={styles.poke}>
              <span className={styles.float}>
                <span className={`${styles.part} ${styles.body}`}>
                  <Layer part="body" near={near} />
                </span>
                <span className={`${styles.part} ${styles.headAct}`}>
                  <span ref={lookRef} className={`${styles.part} ${styles.look}`} data-bloom-look>
                    <span className={`${styles.part} ${styles.headIdle}`}>
                      <Layer part="head" near={near} />
                      <span className={styles.headBox} data-bloom-head />
                      <span className={styles.screen} style={{ left: "39.5%", top: "29.5%", width: "13%", height: "14.6%" }} />
                      <span className={styles.screen} style={{ left: "65.5%", top: "28.7%", width: "12.5%", height: "14.2%" }} />
                      <span className={styles.screen} style={{ left: "52.5%", top: "43.6%", width: "13%", height: "5%" }} />
                      <span className={`${styles.part} ${styles.gaze}`}>
                        <span className={`${styles.part} ${styles.scrollGaze}`} data-bloom-scroll-gaze>
                        <span ref={eyesRef} className={`${styles.part} ${styles.lookEyes}`} data-bloom-eyes>
                          <span className={`${styles.part} ${styles.pokeHide}`}>
                            <span className={`${styles.part} ${styles.eyes}`}>
                              <span className={styles.eye} style={{ left: "41%", top: "30.65%", width: "10%", height: "12.26%" }} />
                              <span className={styles.eye} style={{ left: "67%", top: "29.89%", width: "9.5%", height: "11.88%" }} />
                            </span>
                            <span className={styles.mouth} style={{ left: "54%", top: "44.83%", width: "10%", height: "2.68%" }} />
                          </span>
                          <span className={`${styles.part} ${styles.joys}`}>
                            <span className={styles.joy} style={{ left: "39.5%", top: "32.8%", width: "13%", height: "6.8%" }} />
                            <span className={styles.joy} style={{ left: "65.6%", top: "32%", width: "12.4%", height: "6.5%" }} />
                          </span>
                          <span className={styles.grin} style={{ left: "53%", top: "44%", width: "12%", height: "4.6%" }} />
                          <span className={`${styles.part} ${styles.pokeShow}`}>
                            <span className={styles.joy} style={{ left: "39.5%", top: "32.8%", width: "13%", height: "6.8%" }} />
                            <span className={styles.joy} style={{ left: "65.6%", top: "32%", width: "12.4%", height: "6.5%" }} />
                            <span className={styles.grin} style={{ left: "53%", top: "44%", width: "12%", height: "4.6%", opacity: 1 }} />
                          </span>
                        </span>
                        </span>
                      </span>
                    </span>
                  </span>
                </span>
                <span className={`${styles.part} ${styles.handL}`}>
                  <Layer part="handL" near={near} />
                </span>
                <span className={`${styles.part} ${styles.handR}`}>
                  <Layer part="handR" near={near} />
                  {live ? (
                    <span className={styles.canWrap} data-bloom-can>
                      <WateringCan />
                    </span>
                  ) : null}
                </span>
              </span>
            </span>
          </span>
          </span>
          {live ? (
            <span className={styles.pokeBurst} aria-hidden="true">
              {[-60, -30, 0, 30, 60].map((deg, index) => (
                <span key={deg} className={styles.pokeDot} style={{ "--dx": `${Math.round(Math.sin((deg * Math.PI) / 180) * 34)}px`, "--dy": `${Math.round(-Math.cos((deg * Math.PI) / 180) * 30 - 6)}px`, "--k": index % 3 } as CSSProperties} />
              ))}
            </span>
          ) : null}
        </button>

        <MapFront kind="wide" live={live} />
        <MapFront kind="tall" live={live} />

        {hydrated
          ? (["wide", "tall"] as const).map((kind) => {
              const layout = LAYOUTS[kind];
              return (
                <div key={kind} className={`${styles.hits} ${styles[kind]}`}>
                  {nodeBoxes(layout, locale).map((box, index) => (
                    <button
                      key={index}
                      type="button"
                      className={styles.hit}
                      style={{ left: pct(box.cx, layout.W), top: pct(box.cy, layout.H), width: pct(box.w, layout.W), height: pct(box.h, layout.H) }}
                      aria-label={t.node(titles[index]!)}
                      onClick={(event) => bloomNode(kind, index, event.currentTarget)}
                      onFocus={onNodeFocus}
                      onBlur={aimHome}
                      data-bloom-hit={index}
                    />
                  ))}
                </div>
              );
            })
          : null}
        </div>
      </div>
    </div>
  );
}
