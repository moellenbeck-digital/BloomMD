"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Pause, Play } from "lucide-react";
import styles from "./bloom-agent-scene.module.css";

type Locale = "de" | "en";

/* end: static final image (server render, no JS, reduced motion). ready: before the scene starts.
   play: one-shot scene, then idle loops. idle: scene already seen in this visit, final image with idle loops.
   stopped: paused by the user, shows the final image without any motion. */
type SceneState = "end" | "ready" | "play" | "idle" | "stopped";

/* The scene plays once per visit. A second view in the same tab starts on the final image. */
const SEEN_KEY = "bloommd-agent-scene-seen";

const copy = {
  de: {
    label: "Illustration: Der MD-Agent pflanzt einen Samen und gießt ihn. Daraus wächst eine Mindmap, deren Knoten nacheinander aufblühen.",
    pause: "Animation anhalten",
    play: "Animation abspielen",
  },
  en: {
    label: "Illustration: The MD agent plants a seed and waters it. A mind map grows from it, and its nodes bloom one after another.",
    pause: "Pause animation",
    play: "Play animation",
  },
} as const;

/* Avatar layers: the same image, clipped into head, body and hands (geometry of avatar-200.webp, in percent). */
const AVATAR_SRC = "/agents/md-avatar-200.webp";
const clip = {
  head: "polygon(0% 0%, 100% 0%, 100% 49.04%, 80% 54.02%, 71% 55.75%, 56% 56.7%, 50% 57.28%, 43.5% 57.47%, 37.5% 57.66%, 31% 57.28%, 22.5% 54.79%, 0% 51.72%)",
  body: "polygon(31% 100%, 31% 71.26%, 36% 62.84%, 39.5% 59.39%, 43.5% 56.7%, 47% 55.56%, 50.5% 55.36%, 54% 55.75%, 56.5% 56.7%, 61% 59%, 65.5% 63.22%, 72.5% 72.8%, 72.5% 100%)",
  handL: "polygon(10% 66.28%, 31% 66.28%, 31% 85.82%, 10% 85.82%)",
  handR: "polygon(73% 62.84%, 92.5% 62.84%, 92.5% 81.23%, 73% 81.23%)",
};

function Layer({ part }: { part: keyof typeof clip }) {
  return <img src={AVATAR_SRC} alt="" width={200} height={261} loading="lazy" decoding="async" draggable={false} className={styles.layer} style={{ clipPath: clip[part] }} />;
}

/* Node titles: the "Produktstrategie" / "Product strategy" example map that the landing page already shows
   (useCases[0].file and .markdown in app/page.tsx and app/en/english-landing-page.tsx). No new claims.
   The hierarchy is the one of that Markdown: # root, ## children, ### leaves under the second child. */
const MAP = {
  de: { file: "strategie.md", rootWidth: 132, root: "Strategie", children: ["Ziele", "Initiativen"], leaves: ["Kundenbindung", "Startrisiko"] },
  en: { file: "strategy.md", rootWidth: 164, root: "Product Strategy", children: ["Goals", "Initiatives"], leaves: ["Retention", "Launch risk"] },
} as const;

/* Layout in a 440 × 280 viewBox, balanced around the root: one child top left, one top right,
   the leaves bottom right, the agent bottom left, the stem in the middle. Ground line at y 254.
   The pause button lives in the tab bar above the stage, so it never covers the map. */
const W = 440;
const H = 280;
const GROUND = 254;
const SEED = { x: 160, y: 253 };
const ROOT = { cx: 220, y: 99, h: 38 };
const ROOT_CY = ROOT.y + ROOT.h / 2;
const CHILD = { w: 112, h: 32, cy: 44, cx: [106, 350] as const };
const LEAF = { x: 320, w: 112, h: 28, spine: 312, cy: [168, 210] as const };
/* Where the spout of the tilted watering can ends (see .handR and .canWrap in the CSS). */
const DROP = { x: 150, y: 218 };
const STEM = `M${SEED.x} ${SEED.y + 2} C${SEED.x} 214 ${ROOT.cx - 2} 196 ${ROOT.cx} ${ROOT.y + ROOT.h}`;

const MOTES = [
  [SEED.x + 14, 230],
  [ROOT.cx + 40, 150],
  [LEAF.x + 20, 236],
  [CHILD.cx[0] + 40, 96],
  [ROOT.cx - 46, 176],
] as const;

/* Deterministic sparks: a fan that rises from a burst point. */
function Sparks({ x, y, delay, count = 8, spread = 1, rise = 1 }: { x: number; y: number; delay: number; count?: number; spread?: number; rise?: number }) {
  return (
    <g className={styles.burst} style={{ "--d": `${delay}s` } as CSSProperties} aria-hidden="true">
      <circle cx={x} cy={y} r={14} className={styles.ring} />
      {Array.from({ length: count }, (_, index) => {
        const angle = ((-90 + (index - (count - 1) / 2) * (150 / count) * spread) * Math.PI) / 180;
        const reach = (24 + (index % 3) * 9) * rise;
        const style = {
          "--dx": `${Math.round(Math.cos(angle) * reach)}px`,
          "--dy": `${Math.round(Math.sin(angle) * reach - 10 * rise)}px`,
          "--k": index % 4,
        } as CSSProperties;
        return <circle key={index} cx={x} cy={y} r={index % 3 === 0 ? 2.6 : 1.8} className={styles.spark} style={style} />;
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

export function BloomAgentScene({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const map = MAP[locale];
  const rootW = map.rootWidth;
  const rootX = ROOT.cx - rootW / 2;
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<SceneState>("end");
  const [offscreen, setOffscreen] = useState(false);
  const [motion, setMotion] = useState(false);

  useEffect(() => {
    const node = ref.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!node || reduce.matches || !("IntersectionObserver" in window)) return;
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      /* Storage blocked: play once per page view. */
    }
    setMotion(true);
    setState(seen ? "idle" : "ready");
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        setOffscreen(!entry.isIntersecting);
        if (entry.intersectionRatio >= 0.5) {
          setState((current) => {
            if (current !== "ready") return current;
            try {
              window.sessionStorage.setItem(SEEN_KEY, "1");
            } catch {
              /* ignore */
            }
            return "play";
          });
        }
      }
    }, { threshold: [0, 0.5] });
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

  const running = state === "play" || state === "idle";
  const toggle = () => {
    if (running) {
      setState("stopped");
      return;
    }
    setState("ready");
    requestAnimationFrame(() => requestAnimationFrame(() => setState("play")));
  };

  const childStart = [rootX + 30, rootX + rootW - 30] as const;
  const childBottom = CHILD.cy + CHILD.h / 2;

  return (
    <div ref={ref} className={styles.scene} data-state={state} data-offscreen={offscreen || undefined} data-testid="bloom-agent-scene">
      <div className={styles.bar}>
        <span className={styles.file} data-bloom-file>
          <svg viewBox="0 0 12 14" className={styles.fileIcon} aria-hidden="true" focusable="false">
            <path d="M1.5 1.5 h5.5 l3.5 3.5 v7.5 h-9 z M7 1.5 v3.5 h3.5" />
          </svg>
          {map.file}
        </span>
        {motion ? (
          <button type="button" className={styles.toggle} onClick={toggle} aria-label={running ? t.pause : t.play} data-testid="bloom-agent-scene-toggle">
            {running ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
          </button>
        ) : null}
      </div>

      <div className={styles.stage} role="img" aria-label={t.label} data-testid="bloom-agent-stage">
        <svg className={styles.map} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
          <defs>
            <radialGradient id="bloom-agent-glow">
              <stop offset="0" stopColor="#FF6B35" stopOpacity="0.26" />
              <stop offset="1" stopColor="#FF6B35" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="bloom-agent-seedglow">
              <stop offset="0" stopColor="#FFD27A" stopOpacity="0.9" />
              <stop offset="0.45" stopColor="#FF8A5C" stopOpacity="0.35" />
              <stop offset="1" stopColor="#FF6B35" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx={ROOT.cx} cy={ROOT_CY - 10} r="190" fill="url(#bloom-agent-glow)" className={styles.glow} />
          <path d={`M0 ${GROUND + 0.5} H${W}`} className={styles.ground} />

          <ellipse cx="66" cy={GROUND + 2} rx="40" ry="5" className={styles.shadow} />
          <ellipse cx={SEED.x} cy={GROUND + 1} rx="26" ry="4.5" className={styles.soil} />
          <circle cx={SEED.x} cy={SEED.y - 3} r="30" fill="url(#bloom-agent-seedglow)" className={styles.seedGlow} />
          <ellipse cx={SEED.x} cy={GROUND} rx="20" ry="5" className={styles.ripple} />

          <path d={STEM} pathLength={1} className={`${styles.stem} ${styles.draw}`} />
          <path d={`M${SEED.x + 9} 228 c15 -1 23 -9 24 -19 c-11 -1 -21 6 -24 19 z`} className={`${styles.leaf} ${styles.leafA}`} />
          <path d={`M${SEED.x + 36} 203 c-13 -7 -25 -6 -30 1 c9 7 22 7 30 -1 z`} className={`${styles.leaf} ${styles.leafB}`} />
          <ellipse cx={ROOT.cx} cy={ROOT.y + ROOT.h - 2} rx="9" ry="11" className={styles.bud} />

          {CHILD.cx.map((cx, index) => {
            const d = `M${childStart[index]} ${ROOT.y} C${childStart[index]} ${ROOT.y - 30} ${cx} ${childBottom + 34} ${cx} ${childBottom}`;
            return (
              <g key={`edge-${cx}`} style={{ "--i": index } as CSSProperties}>
                <path d={d} pathLength={1} className={`${styles.edge} ${styles.draw}`} />
                <path d={d} pathLength={1} className={styles.flow} />
              </g>
            );
          })}
          {LEAF.cy.map((cy, index) => {
            const d = `M${LEAF.spine} ${childBottom} V${cy - 10} Q${LEAF.spine} ${cy} ${LEAF.x} ${cy}`;
            return (
              <g key={`twig-${cy}`} style={{ "--i": index } as CSSProperties}>
                <path d={d} pathLength={1} className={`${styles.edge} ${styles.twig} ${styles.draw}`} />
                <path d={d} pathLength={1} className={`${styles.flow} ${styles.flowTwig}`} />
              </g>
            );
          })}

          <g className={styles.rootNode} data-bloom-node="root">
            <rect x={rootX} y={ROOT.y} width={rootW} height={ROOT.h} rx="11" className={styles.rootRect} />
            <text x={rootX + 13} y={ROOT_CY + 5} className={styles.rootMark}>#</text>
            <text x={rootX + 29} y={ROOT_CY + 5} className={styles.rootTitle}>{map.root}</text>
          </g>

          {CHILD.cx.map((cx, index) => (
            <g key={`node-${cx}`} className={styles.childNode} style={{ "--i": index } as CSSProperties} data-bloom-node="child">
              <rect x={cx - CHILD.w / 2} y={CHILD.cy - CHILD.h / 2} width={CHILD.w} height={CHILD.h} rx="9" className={styles.childRect} />
              <text x={cx - CHILD.w / 2 + 11} y={CHILD.cy + 4.5} className={styles.childMark}>##</text>
              <text x={cx - CHILD.w / 2 + 31} y={CHILD.cy + 4.5} className={styles.childTitle}>{map.children[index]}</text>
            </g>
          ))}

          {LEAF.cy.map((cy, index) => (
            <g key={`leaf-${cy}`} className={styles.leafNode} style={{ "--i": index } as CSSProperties} data-bloom-node="leaf">
              <rect x={LEAF.x} y={cy - LEAF.h / 2} width={LEAF.w} height={LEAF.h} rx="14" className={styles.leafRect} />
              <circle cx={LEAF.x + 11} cy={cy} r="2.6" className={styles.leafDot} />
              <text x={LEAF.x + LEAF.w / 2 + 6} y={cy + 4} textAnchor="middle" className={styles.leafTitle}>{map.leaves[index]}</text>
            </g>
          ))}

          <Sparks x={ROOT.cx} y={ROOT.y} delay={2.72} count={10} rise={1.2} />
          <Sparks x={CHILD.cx[0]} y={CHILD.cy - 8} delay={3.36} />
          <Sparks x={CHILD.cx[1]} y={CHILD.cy - 8} delay={3.54} />
          <Sparks x={LEAF.x + LEAF.w / 2} y={LEAF.cy[0] - 6} delay={3.96} count={6} rise={0.8} />
          <Sparks x={LEAF.x + LEAF.w / 2} y={LEAF.cy[1] - 6} delay={4.1} count={6} rise={0.8} />

          {/* Ambient pollen after the scene: a few motes drift up from the map. */}
          {MOTES.map(([x, y], k) => (
            <circle key={k} cx={x} cy={y} r={k % 2 ? 1.6 : 2.2} className={styles.mote} style={{ "--k": k } as CSSProperties} />
          ))}
        </svg>

        <div className={styles.shine} aria-hidden="true" />

        <div className={styles.avatar} aria-hidden="true" data-testid="bloom-agent-avatar">
          <div className={styles.hop}>
            <div className={styles.float}>
              <div className={`${styles.part} ${styles.body}`}>
                <Layer part="body" />
              </div>
              <div className={`${styles.part} ${styles.headAct}`}>
                <div className={`${styles.part} ${styles.headIdle}`}>
                  <Layer part="head" />
                  <span className={styles.screen} style={{ left: "39.5%", top: "29.5%", width: "13%", height: "14.6%" }} />
                  <span className={styles.screen} style={{ left: "65.5%", top: "28.7%", width: "12.5%", height: "14.2%" }} />
                  <span className={styles.screen} style={{ left: "52.5%", top: "43.6%", width: "13%", height: "5%" }} />
                  <div className={`${styles.part} ${styles.gaze}`}>
                    <div className={`${styles.part} ${styles.eyes}`}>
                      <span className={styles.eye} style={{ left: "41%", top: "30.65%", width: "10%", height: "12.26%" }} />
                      <span className={styles.eye} style={{ left: "67%", top: "29.89%", width: "9.5%", height: "11.88%" }} />
                    </div>
                    <div className={`${styles.part} ${styles.joys}`}>
                      <span className={styles.joy} style={{ left: "39.5%", top: "32.8%", width: "13%", height: "6.8%" }} />
                      <span className={styles.joy} style={{ left: "65.6%", top: "32%", width: "12.4%", height: "6.5%" }} />
                    </div>
                    <span className={styles.mouth} style={{ left: "54%", top: "44.83%", width: "10%", height: "2.68%" }} />
                    <span className={styles.grin} style={{ left: "53%", top: "44%", width: "12%", height: "4.6%" }} />
                  </div>
                </div>
              </div>
              <div className={`${styles.part} ${styles.handL}`}>
                <Layer part="handL" />
              </div>
              <div className={`${styles.part} ${styles.handR}`}>
                <Layer part="handR" />
                <div className={styles.canWrap}>
                  <WateringCan />
                </div>
              </div>
            </div>
          </div>
        </div>

        <svg className={styles.map} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <g key={index} transform={`translate(${DROP.x + (index % 3) * 1.5} ${DROP.y})`}>
              <path d="M0 -3.4 C1.8 -0.6 2.4 0.6 2.4 1.4 a2.4 2.4 0 0 1 -4.8 0 C-2.4 0.6 -1.8 -0.6 0 -3.4 z" className={styles.drop} style={{ "--i": index } as CSSProperties} />
            </g>
          ))}
          <g className={styles.seedFall}>
            <g className={styles.seedSquash}>
              <ellipse cx={SEED.x} cy={SEED.y - 3.5} rx="4.8" ry="5.8" className={styles.seed} />
            </g>
          </g>
          <Sparks x={72} y={100} delay={4.78} count={9} spread={2.2} rise={1.1} />
        </svg>
      </div>
    </div>
  );
}
