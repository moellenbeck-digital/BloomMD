"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

const proof = ["Echte Aufnahme", "Branch gezogen", "Markdown aktualisiert"];

/* The recording loops, so it needs a pause control. Reduced motion: it stands on its last frame. */
function DemoVideo() {
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
        aria-label="Echte BloomMD-Aufnahme: ein Branch wird gezogen und die Markdown-Struktur aktualisiert sich."
        data-testid="branch-drag-demo-video"
      />
      <button type="button" className={styles.control} onClick={toggle}>
        {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
        {playing ? "Aufnahme anhalten" : "Aufnahme abspielen"}
      </button>
    </div>
  );
}

export function SplitDemo() {
  const [view, grow] = useGrowOnView<HTMLUListElement>();

  return (
    <section className={`${t.ground} ${bmdFonts} ${styles.section}`} aria-labelledby="demo-title" data-testid="demo-trieb">
      <div className={t.wrap}>
        <p className={t.kicker}>Aus Text wird Raum</p>
        <h2 id="demo-title" className={styles.title}>Aus Markdown wird ein navigierbarer Wissensraum.</h2>
        <p className={`${t.lede} ${styles.lede}`}>
          Markdown bleibt die Quelle. BloomMD ist die visuelle Ebene, in der du Struktur erkennst und ohne Formatwechsel weiterarbeitest.
        </p>
        <div className={styles.board}>
          <div className={styles.file}>
            <p className={styles.filename}>research-plan.md <span>Markdown</span></p>
            <pre>
              {source.split("\n").map((line, index) => (
                <span key={index} data-heading={line.startsWith("#") || undefined}>{`${line}\n`}</span>
              ))}
            </pre>
          </div>
          <DemoVideo />
        </div>
        <ul ref={view} className={styles.proof} data-grow={grow}>
          {proof.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </div>
    </section>
  );
}
