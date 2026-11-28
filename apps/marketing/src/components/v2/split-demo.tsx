"use client";

import { Pause, Play } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MarketingLocale } from "@/lib/locale";
import { bmdFonts } from "./fonts";
import { useGrowOnView } from "./use-grow-on-view";
import t from "./tokens.module.css";
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

/* The recording loops, so it needs a pause control. Reduced motion: it stands on its last frame. */
function DemoVideo({ c }: { c: (typeof copy)[MarketingLocale] }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
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
      <button type="button" className={styles.control} onClick={toggle}>
        {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
        {playing ? c.pause : c.play}
      </button>
    </div>
  );
}

export function SplitDemo({ locale = "de" }: { locale?: MarketingLocale }) {
  const c = copy[locale];
  const [view, grow] = useGrowOnView<HTMLUListElement>();

  return (
    <section className={`${t.ground} ${bmdFonts} ${styles.section}`} aria-labelledby="demo-title" data-testid="demo-trieb">
      <div className={t.wrap}>
        <p className={t.kicker}>{c.kicker}</p>
        <h2 id="demo-title" className={styles.title}>{c.title}</h2>
        <p className={`${t.lede} ${styles.lede}`}>{c.lede}</p>
        <div className={styles.board} data-solo={!c.sourceFile || undefined}>
          {c.sourceFile && (
            <div className={styles.file}>
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
        <ul ref={view} className={styles.proof} data-grow={grow}>
          {c.proof.map((item) => <li key={item}>{item}</li>)}
        </ul>
        {c.actions.length > 0 && (
          <div className={styles.actions}>
            {c.actions.map((action) => <Link key={action.href} href={action.href} className={t.twig}>{action.label}</Link>)}
          </div>
        )}
      </div>
    </section>
  );
}
