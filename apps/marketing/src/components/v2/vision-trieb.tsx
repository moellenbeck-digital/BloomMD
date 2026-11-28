"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { Bloom, Branch, Bud } from "./branch";
import motion from "./branch.module.css";
import { bmdFonts } from "./fonts";
import t from "./tokens.module.css";
import type { TriebShape } from "./trieb";
import { useGrowOnView } from "./use-grow-on-view";
import styles from "./vision-trieb.module.css";

export interface VisionCopy {
  eyebrow: string;
  title: string;
  intro: string;
  today: string;
  todayText: string;
  pilot: string;
  pilotText: string;
  exploring: string;
  fields: readonly { number: string; issues: readonly number[]; title: string; question: string; detail: string }[];
  foundation: string;
  roadmap: string;
}

const W = 1224;
const H = 712;

/* One trunk, three stages. Thickness is maturity: shipped is heavy, the pilot lighter, exploring a tendril. */
const today: TriebShape = { from: [-52, -460], at: [20, 322], length: 344, w: [30, 21, 15], bend: "v" };
const pilot: TriebShape = { from: [362, 322], at: [436, 152], length: 232, w: [11, 7, 5] };
const exploring: TriebShape = { from: [362, 322], at: [436, 466], length: 204, w: [9, 5.5, 4] };
const fieldY = [66, 238, 410, 582];
const tendrils: TriebShape[] = fieldY.map((y) => ({ from: [638, 466], at: [786, y], length: 420, w: [4, 1.6, 0.3] }));
/* Roots: one thick collar at the soil line, a tap root and laterals that fork, same taper rule as above. */
const roots: TriebShape[] = [
  { from: [60, 496], at: [78, 622], length: 22, w: [20, 5, 0.8], bend: "v" },
  { from: [58, 524], at: [2, 584], length: 0, w: [11, 1, 1], bend: "v" },
  { from: [62, 528], at: [172, 600], length: 54, w: [13, 4, 0.6], bend: "v" },
  { from: [64, 522], at: [236, 556], length: 108, w: [12, 3.6, 0.5], bend: "v" },
  { from: [50, 550], at: [26, 622], length: 0, w: [6, 0.6, 0.6], bend: "v" },
  { from: [112, 578], at: [138, 630], length: 0, w: [5, 0.6, 0.6], bend: "v" },
  { from: [216, 554], at: [270, 596], length: 30, w: [4.5, 1.6, 0.4], bend: "v" },
];
/* Narrow screens: the same roots under the lower end of the vertical trunk. */
const narrowRoots: TriebShape[] = [
  { from: [7, 0], at: [26, 70], length: 8, w: [9, 2.6, 0.6], bend: "v" },
  { from: [9, 14], at: [124, 48], length: 70, w: [7, 2.2, 0.4], bend: "v" },
  { from: [8, 20], at: [72, 66], length: 26, w: [6, 1.8, 0.4], bend: "v" },
  { from: [92, 45], at: [124, 70], length: 0, w: [3, 0.5, 0.5], bend: "v" },
];

/* Narrow screens: a twig from the vertical trunk to each heading. */
const twig: TriebShape = { from: [7, 0], at: [30, 22], length: 10, w: [6, 2.6, 1], bend: "v" };

const place = (x: number, y: number, delay: number) => ({ "--x": x, "--y": y, "--d": `${delay}ms` }) as CSSProperties;
const stem = (from: number, to: number) => ({ "--a": `${from}px`, "--b": `${to}px` }) as CSSProperties;

function Twig({ id, delay, mark }: { id: string; delay: number; mark?: "bloom" | "bud" }) {
  return (
    <svg className={styles.twig} viewBox="0 0 44 36" aria-hidden="true" focusable="false">
      <Branch id={id} shape={twig} timing={{ delay, duration: 360 }} />
      {mark === "bloom" && <Bloom at={[30, 22]} size={12} timing={{ delay: delay + 200, duration: 420 }} />}
      {mark === "bud" && <Bud at={[28, 22]} size={19} timing={{ delay: delay + 200, duration: 420 }} />}
    </svg>
  );
}

export function VisionTrieb({ copy, roadmapHref }: { copy: VisionCopy; roadmapHref: string }) {
  const [ref, state] = useGrowOnView<HTMLDivElement>();

  return (
    <section id="vision" aria-labelledby="vision-title" className={`${t.ground} ${t.deep} ${t.night} ${bmdFonts} ${styles.section}`}>
      <div className={t.wrap}>
        <header className={styles.head}>
          <div>
            <p className={t.kicker}>{copy.eyebrow}</p>
            <h2 id="vision-title" className={`${t.title} ${styles.title}`}>{copy.title}</h2>
          </div>
          <div className={styles.aside}>
            <p className={t.lede}>{copy.intro}</p>
            <Link href={roadmapHref} className={`${t.twig} ${styles.roadmap}`}>
              {copy.roadmap}<ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </header>

        <div ref={ref} className={styles.stage} data-grow={state} data-testid="vision-trieb">
          <svg className={styles.wideSvg} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
            <Branch id="vision-today" shape={today} timing={{ delay: 0, duration: 620 }} lit />
            <Branch id="vision-pilot" shape={pilot} timing={{ delay: 400, duration: 480 }} />
            <Branch id="vision-exploring" shape={exploring} timing={{ delay: 460, duration: 440 }} />
            {tendrils.map((shape, i) => <Branch key={i} id={`vision-field-${i}`} shape={shape} timing={{ delay: 760 + i * 90, duration: 460 }} />)}
            <Bloom at={[372, 322]} size={30} timing={{ delay: 560, duration: 460 }} />
            <Bud at={[666, 152]} size={38} timing={{ delay: 820, duration: 420 }} />
            <line x1="0" y1="520" x2="400" y2="520" className={styles.soil} />
            {roots.map((shape, i) => <Branch key={i} id={`vision-root-${i}`} shape={shape} timing={{ delay: 300 + i * 70, duration: 420 }} className={styles.root} />)}
          </svg>

          <div className={`${styles.stageItem} ${styles.today} ${motion.arrive}`} style={place(20, 322, 380)}>
            <span className={styles.stem} style={stem(14, 11)} aria-hidden="true" />
            <Twig id="vision-n-today" delay={0} mark="bloom" />
            <p className={styles.name}>{copy.today}</p>
            <p className={styles.body}>{copy.todayText}</p>
          </div>
          <div className={`${styles.stageItem} ${styles.pilot} ${motion.arrive}`} style={place(436, 152, 680)}>
            <span className={styles.stem} style={stem(11, 7)} aria-hidden="true" />
            <Twig id="vision-n-pilot" delay={120} mark="bud" />
            <p className={styles.name}>{copy.pilot}</p>
            <p className={styles.body}>{copy.pilotText}</p>
          </div>
          <div className={`${styles.stageItem} ${styles.exploring} ${motion.arrive}`} style={place(436, 466, 720)}>
            <span className={styles.stem} style={stem(7, 5)} aria-hidden="true" />
            <Twig id="vision-n-exploring" delay={240} />
            <p className={styles.name}>{copy.exploring}</p>
          </div>
          <ul className={styles.fields}>
            {copy.fields.map((field, i) => (
              <li key={field.number} className={`${styles.stageItem} ${styles.field} ${motion.arrive}`} style={place(786, fieldY[i]!, 1020 + i * 90)}>
                <span className={styles.stem} style={stem(5 - i * 0.8, 4.2 - i * 0.8)} aria-hidden="true" />
                <Twig id={`vision-n-field-${i}`} delay={300 + i * 80} />
                <div className={styles.name}>
                  <p className={styles.number}>{field.number}</p>
                  <h3>{field.title}</h3>
                </div>
                <div className={styles.body}>
                  <p className={styles.question}>{field.question}</p>
                  <p className={styles.detail}>{field.detail}</p>
                  <p className={styles.issues}>
                    {field.issues.map((issue) => (
                      <a key={issue} href={`https://github.com/moellenbeck-digital/BloomMD/issues/${issue}`} aria-label={`${field.title}: Issue ${issue}`}>
                        #{issue}
                      </a>
                    ))}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <svg className={styles.narrowRoots} viewBox="0 0 220 76" aria-hidden="true" focusable="false">
            <line x1="0" y1="10" x2="220" y2="10" className={styles.soil} />
            {narrowRoots.map((shape, i) => <Branch key={i} id={`vision-root-narrow-${i}`} shape={shape} timing={{ delay: 360 + i * 70, duration: 420 }} className={styles.root} />)}
          </svg>
          <p className={styles.foundation}>{copy.foundation}</p>
        </div>
      </div>
    </section>
  );
}
