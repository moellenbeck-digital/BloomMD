"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Pause, Play } from "lucide-react";
import styles from "./bloom-agent-scene.module.css";

type Locale = "de" | "en";

/* end: static final image (server render, no JS, reduced motion). ready: before the scene starts.
   play: one-shot scene, then idle float/blink. stopped: paused by the user, shows the final image. */
type SceneState = "end" | "ready" | "play" | "stopped";

const copy = {
  de: {
    label: "Illustration: Der MD-Agent pflanzt einen Samen. Daraus wächst eine Mindmap, deren Knoten nacheinander aufblühen.",
    pause: "Animation anhalten",
    play: "Animation abspielen",
  },
  en: {
    label: "Illustration: The MD agent plants a seed. A mind map grows from it, and its nodes bloom one after another.",
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
   (useCases[0] in app/page.tsx and app/en/english-landing-page.tsx). No new claims. */
const MAP = {
  de: { file: "strategie.md", rootWidth: 128, root: "Strategie", children: ["Ziele", "Initiativen"], leaves: ["Kundenbindung", "Startrisiko"] },
  en: { file: "strategy.md", rootWidth: 158, root: "Product Strategy", children: ["Goals", "Initiatives"], leaves: ["Retention", "Launch risk"] },
} as const;

/* Layout in a 440 × 320 viewBox. Everything grows above the ground line (y 280).
   The strip below it is the floor; its right end belongs to the pause button. */
const SEED = { x: 152, y: 279 };
const ROOT = { x: 142, y: 98, h: 38 };
const ROOT_CY = ROOT.y + ROOT.h / 2;
const CHILD = { x: 318, w: 110, h: 32 };
const CHILD_CY = [52, ROOT_CY];
const LEAF = { x: 330, w: 98, h: 28, spine: 323 };
const LEAF_CY = [172, 210];
const PETALS = [0, 60, 120, 180, 240, 300];

function Petals({ cx, cy, radius, index }: { cx: number; cy: number; radius: number; index: number }) {
  return (
    <g className={styles.petals} style={{ "--i": index } as CSSProperties}>
      {PETALS.map((angle) => {
        const rad = (angle * Math.PI) / 180;
        const style = { "--dx": `${Math.round(Math.cos(rad) * radius)}px`, "--dy": `${Math.round(Math.sin(rad) * radius * 0.7)}px` } as CSSProperties;
        return <circle key={angle} cx={cx} cy={cy} r={4.5} className={styles.petal} style={style} />;
      })}
    </g>
  );
}

export function BloomAgentScene({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const map = MAP[locale];
  const rootW = map.rootWidth;
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<SceneState>("end");
  const [offscreen, setOffscreen] = useState(false);
  const [motion, setMotion] = useState(false);

  useEffect(() => {
    const node = ref.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!node || reduce.matches || !("IntersectionObserver" in window)) return;
    setMotion(true);
    setState("ready");
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        setOffscreen(!entry.isIntersecting);
        if (entry.intersectionRatio >= 0.5) setState((current) => (current === "ready" ? "play" : current));
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

  const toggle = () => {
    if (state === "play") {
      setState("stopped");
      return;
    }
    setState("ready");
    requestAnimationFrame(() => requestAnimationFrame(() => setState("play")));
  };

  const playing = state === "play";

  return (
    <div ref={ref} className={styles.scene} data-state={state} data-offscreen={offscreen || undefined} data-testid="bloom-agent-scene">
      <div className={styles.stage} role="img" aria-label={t.label}>
        <svg className={styles.map} viewBox="0 0 440 320" aria-hidden="true" focusable="false">
          <defs>
            <radialGradient id="bloom-agent-glow">
              <stop offset="0" stopColor="#FF6B35" stopOpacity="0.22" />
              <stop offset="1" stopColor="#FF6B35" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="296" cy="140" r="164" fill="url(#bloom-agent-glow)" className={styles.glow} />
          <path d="M0 280.5 H440" className={styles.ground} />

          <g className={styles.file} data-bloom-node="file">
            <rect x="12" y="12" width={map.file.length * 6.4 + 32} height="24" rx="7" className={styles.fileRect} />
            <path d="M22 18.5 h5.5 l3.5 3.5 v8 h-9 z" className={styles.fileIcon} />
            <text x="36" y="28" className={styles.fileName}>{map.file}</text>
          </g>

          <ellipse cx="70" cy="281" rx="40" ry="5" className={styles.shadow} />
          <ellipse cx={SEED.x} cy="281" rx="24" ry="4.5" className={styles.soil} />
          <ellipse cx={SEED.x} cy="280" rx="20" ry="5" className={styles.ripple} />

          <path d={`M${SEED.x} ${SEED.y + 2} C${SEED.x} 232 ${SEED.x + 6} 172 ${ROOT.x + 30} ${ROOT.y + ROOT.h}`} className={`${styles.stem} ${styles.grow}`} />
          <path d={`M${SEED.x + 1} 246 c14 -2 21 -10 21 -18 c-10 0 -19 6 -21 18 z`} className={`${styles.leaf} ${styles.leafA}`} />
          <path d={`M${SEED.x + 4} 204 c-12 -6 -22 -4 -26 2 c8 6 19 6 26 -2 z`} className={`${styles.leaf} ${styles.leafB}`} />

          {CHILD_CY.map((cy, index) => (
            <path
              key={`edge-${cy}`}
              d={`M${ROOT.x + rootW} ${ROOT_CY} C${ROOT.x + rootW + 10} ${ROOT_CY} ${CHILD.x - 10} ${cy} ${CHILD.x} ${cy}`}
              className={`${styles.edge} ${styles.grow}`}
              style={{ "--i": index, transformOrigin: `${ROOT.x + rootW}px ${ROOT_CY}px` } as CSSProperties}
            />
          ))}
          {LEAF_CY.map((cy, index) => (
            <path
              key={`twig-${cy}`}
              d={`M${LEAF.spine} ${ROOT_CY + CHILD.h / 2} V${cy - 8} Q${LEAF.spine} ${cy} ${LEAF.x} ${cy}`}
              className={`${styles.edge} ${styles.twig} ${styles.grow}`}
              style={{ "--i": index, transformOrigin: `${LEAF.spine}px ${ROOT_CY + CHILD.h / 2}px` } as CSSProperties}
            />
          ))}

          <Petals cx={ROOT.x + rootW / 2} cy={ROOT_CY} radius={70} index={-3} />
          <g className={styles.rootNode} data-bloom-node="root">
            <rect x={ROOT.x} y={ROOT.y} width={rootW} height={ROOT.h} rx="11" className={styles.rootRect} />
            <text x={ROOT.x + 13} y={ROOT_CY + 5} className={styles.rootMark}>#</text>
            <text x={ROOT.x + 29} y={ROOT_CY + 4.5} className={styles.rootTitle}>{map.root}</text>
          </g>

          {CHILD_CY.map((cy, index) => (
            <g key={`node-${cy}`}>
              <Petals cx={CHILD.x + CHILD.w / 2} cy={cy} radius={52} index={index} />
              <g className={styles.childNode} style={{ "--i": index } as CSSProperties} data-bloom-node="child">
                <rect x={CHILD.x} y={cy - CHILD.h / 2} width={CHILD.w} height={CHILD.h} rx="9" className={styles.childRect} />
                <text x={CHILD.x + 10} y={cy + 4} className={styles.childMark}>##</text>
                <text x={CHILD.x + 29} y={cy + 4.2} className={styles.childTitle}>{map.children[index]}</text>
              </g>
            </g>
          ))}

          {LEAF_CY.map((cy, index) => (
            <g key={`leaf-${cy}`} className={styles.leafNode} style={{ "--i": index } as CSSProperties} data-bloom-node="leaf">
              <rect x={LEAF.x} y={cy - LEAF.h / 2} width={LEAF.w} height={LEAF.h} rx="14" className={styles.leafRect} />
              <text x={LEAF.x + LEAF.w / 2} y={cy + 4} textAnchor="middle" className={styles.leafTitle}>{map.leaves[index]}</text>
            </g>
          ))}
        </svg>

        <div className={styles.avatar} aria-hidden="true">
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
                  </div>
                </div>
              </div>
              <div className={`${styles.part} ${styles.handL}`}>
                <Layer part="handL" />
              </div>
              <div className={`${styles.part} ${styles.handR}`}>
                <Layer part="handR" />
              </div>
            </div>
          </div>
        </div>
        <svg className={styles.map} viewBox="0 0 440 320" aria-hidden="true" focusable="false">
          <g className={styles.seedFall}>
            <g className={styles.seedSquash}>
              <ellipse cx={SEED.x} cy={SEED.y - 3.5} rx="4.8" ry="5.8" className={styles.seed} />
            </g>
          </g>
        </svg>
      </div>

      {motion ? (
        <button type="button" className={styles.toggle} onClick={toggle} aria-label={playing ? t.pause : t.play} data-testid="bloom-agent-scene-toggle">
          {playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
        </button>
      ) : null}
    </div>
  );
}
