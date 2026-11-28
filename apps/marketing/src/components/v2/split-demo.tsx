"use client";

import { Pause, Play } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MarketingLocale } from "@/lib/locale";
import { Branch } from "./branch";
import { bmdFonts } from "./fonts";
import { useGrowOnView } from "./use-grow-on-view";
import t from "./tokens.module.css";
import type { TriebShape } from "./trieb";
import styles from "./split-demo.module.css";

const source = `# Research Plan

## Core Question
How do local-first tools help writers keep control?

## Sources
- Interviews
- Product notes
- Architecture decisions

## Findings
### Portability
Open files reduce migration pressure.

### Structure
Visual maps reveal relationships faster.`;

const copy = {
  de: {
    kicker: "Aus Text wird Raum",
    title: "Aus Markdown wird ein navigierbarer Wissensraum.",
    lede: "Markdown bleibt die Quelle. BloomMD ist die visuelle Ebene, in der du Struktur erkennst und ohne Formatwechsel weiterarbeitest.",
    proof: ["Echte Aufnahme", "Branch gezogen", "Markdown aktualisiert"],
    video: "Echte BloomMD-Aufnahme: ein Branch wird gezogen und die Markdown-Struktur aktualisiert sich.",
    testId: "branch-drag-demo-video",
    pause: "Aufnahme anhalten",
    play: "Aufnahme abspielen",
    /* The source file beside the recording; the earlier /en page showed the recording alone. */
    sourceFile: true,
    actions: [] as readonly { label: string; href: string }[],
  },
  en: {
    kicker: "Text becomes space",
    title: "Markdown turns into a navigable workspace.",
    lede: "The M1 proof is intentionally concrete: real product recordings, local files and desktop beta builds for macOS and Omarchy/Linux, alongside private web access.",
    proof: ["Real recording", "Branch moved", "Markdown updated"],
    video: "Real BloomMD recording: a branch is moved and the Markdown structure updates.",
    testId: "english-branch-drag-demo-video",
    pause: "Pause recording",
    play: "Play recording",
    sourceFile: false,
    actions: [
      { label: "Open the demo", href: "/demo?lang=en" },
      { label: "Browse templates", href: "/templates?lang=en" },
    ] as readonly { label: string; href: string }[],
  },
} as const;

/* Wide: one shoot under the three proofs, with a twig rising to the second and third. */
const proofShoots: TriebShape[] = [
  { from: [4, -4], at: [70, 34], length: 1080, w: [14, 8, 1.5], bend: "v" },
  { from: [352, 34], at: [436, 10], length: 190, w: [7, 3, 0.8] },
  { from: [752, 34], at: [836, 10], length: 160, w: [5, 2.4, 0.6] },
];

/* The recording loops, so it needs a pause control. Reduced motion: it stands on its last frame.
   Without JavaScript the control could do nothing: the browser's own controls take over, and
   the recording starts only when the visitor presses play. */
function DemoVideo({ c }: { c: (typeof copy)[MarketingLocale] }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const video = ref.current;
    if (!video) return;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // A blocked autoplay leaves the first frame and the play button.
      video.play().catch(() => {});
      return;
    }
    // A WebM without a duration reports Infinity: seeking far past the end lands on the last frame.
    const showEnd = () => {
      video.currentTime = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.05) : 1e6;
    };
    if (video.readyState >= 1) showEnd();
    else video.addEventListener("loadedmetadata", showEnd, { once: true });
    return () => video.removeEventListener("loadedmetadata", showEnd);
  }, []);

  const toggle = () => {
    const video = ref.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  return (
    <div className={styles.recording}>
      <noscript>
        <style>{"[data-script-video]{display:none}"}</style>
        <video className={styles.video} src="/demo-branch-drag-markdown.webm" controls muted loop playsInline preload="metadata" aria-label={c.video} />
      </noscript>
      <div data-script-video="">
        <video
          ref={ref}
          className={styles.video}
          src="/demo-branch-drag-markdown.webm"
          muted
          loop
          playsInline
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          aria-label={c.video}
          data-testid={c.testId}
        />
        {/* The row keeps its height, so the button appearing after mount moves nothing. */}
        <div className={styles.controls}>
          {mounted && (
            <button type="button" className={styles.control} onClick={toggle}>
              {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
              {playing ? c.pause : c.play}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function SplitDemo({ locale = "de" }: { locale?: MarketingLocale }) {
  const c = copy[locale];
  const [view, grow] = useGrowOnView<HTMLDivElement>();

  return (
    <section className={`${t.ground} ${bmdFonts} ${styles.section}`} aria-labelledby="demo-title" data-testid="demo-trieb">
      <div className={t.wrap}>
        <p className={t.kicker}>{c.kicker}</p>
        <h2 id="demo-title" className={styles.title}>{c.title}</h2>
        <p className={`${t.lede} ${styles.lede}`}>{c.lede}</p>
        <div className={styles.board} data-solo={!c.sourceFile || undefined}>
          {c.sourceFile && (
            <div className={`${t.night} ${styles.file}`}>
              <p className={styles.filename}>research-plan.md <span>Markdown</span></p>
              <pre>
                {source.split("\n").map((line, index) => (
                  <span key={index} data-heading={line.startsWith("#") || undefined}>{`${line}\n`}</span>
                ))}
              </pre>
            </div>
          )}
          <DemoVideo c={c} />
        </div>
        <div ref={view} className={styles.proofs} data-grow={grow}>
          <ul className={styles.proof}>
            {c.proof.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <svg className={styles.shoot} viewBox="0 0 1200 44" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            {proofShoots.map((shape, i) => <Branch key={i} id={`demo-proof-${i}`} shape={shape} timing={{ delay: i * 120, duration: 560 }} lit={i === 0} />)}
          </svg>
        </div>
        {c.actions.length > 0 && (
          <div className={styles.actions}>
            {c.actions.map((action) => <Link key={action.href} href={action.href} className={t.twig}>{action.label}</Link>)}
          </div>
        )}
      </div>
    </section>
  );
}
