/* "Der Trieb": a tapered branch. It leaves its origin thick, bends once, then carries the word as a
   thinning underline. Pure geometry, so it renders on the server and never measures the DOM. */
export type Point = readonly [number, number];

export interface TriebShape {
  from: Point;
  /* Where the word starts; the baseline branch runs from here to `at[0] + length`. */
  at: Point;
  length: number;
  /* Widths at origin, at the word start and at the tip. */
  w: readonly [number, number, number];
  /* "h": leaves sideways (wide map). "v": drops first, then turns (trunk and narrow map). */
  bend?: "h" | "v";
}

const STEPS = 28;
const round = (value: number) => Math.round(value * 10) / 10;

export function controlPoints({ from, at, bend = "h" }: Pick<TriebShape, "from" | "at" | "bend">): [Point, Point] {
  const dx = at[0] - from[0];
  const dy = at[1] - from[1];
  return bend === "h"
    ? [[from[0] + dx * 0.62, from[1] + dy * 0.04], [at[0] - dx * 0.55, at[1]]]
    : [[from[0] + dx * 0.02, from[1] + dy * 0.72], [at[0] - dx * 0.85, at[1]]];
}

function cubic(a: Point, b: Point, c: Point, d: Point, t: number): Point {
  const u = 1 - t;
  const f = (i: 0 | 1) => u * u * u * a[i] + 3 * u * u * t * b[i] + 3 * u * t * t * c[i] + t * t * t * d[i];
  return [f(0), f(1)];
}

/* Centerline path: used by the growth mask. */
export function centerline(shape: TriebShape): string {
  const [c1, c2] = controlPoints(shape);
  const { from, at, length } = shape;
  const tail = length > 0 ? ` L${at[0] + length} ${at[1]}` : "";
  return `M${from[0]} ${from[1]} C${round(c1[0])} ${round(c1[1])} ${round(c2[0])} ${round(c2[1])} ${at[0]} ${at[1]}${tail}`;
}

/* Filled outline with a width that falls from origin to tip. */
export function outline(shape: TriebShape, scale = 1): string {
  const [c1, c2] = controlPoints(shape);
  const { from, at, length, w } = shape;
  const points: { p: Point; w: number }[] = [];
  for (let i = 0; i <= STEPS; i += 1) {
    const t = i / STEPS;
    points.push({ p: cubic(from, c1, c2, at, t), w: w[0] + (w[1] - w[0]) * (1 - (1 - t) * (1 - t)) });
  }
  if (length > 0) {
    for (let i = 1; i <= STEPS / 2; i += 1) {
      const t = i / (STEPS / 2);
      points.push({ p: [at[0] + length * t, at[1]], w: w[1] + (w[2] - w[1]) * t });
    }
  }
  const left: string[] = [];
  const right: string[] = [];
  points.forEach(({ p, w: width }, i) => {
    const prev = points[Math.max(0, i - 1)]!.p;
    const next = points[Math.min(points.length - 1, i + 1)]!.p;
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const norm = Math.hypot(dx, dy) || 1;
    const half = (width * scale) / 2;
    const nx = (-dy / norm) * half;
    const ny = (dx / norm) * half;
    left.push(`${round(p[0] + nx)} ${round(p[1] + ny)}`);
    right.push(`${round(p[0] - nx)} ${round(p[1] - ny)}`);
  });
  return `M${left.join(" L")} L${right.reverse().join(" L")} Z`;
}

/* A closed bud pointing up before rotation: pointed teardrop, held by one sepal on each side. */
export function bud(size: number): { body: string; sepals: string } {
  const s = (k: number) => round(size * k);
  return {
    body: `M0 0 C${s(-0.46)} ${s(-0.12)} ${s(-0.4)} ${s(-0.62)} 0 ${s(-1)} C${s(0.4)} ${s(-0.62)} ${s(0.46)} ${s(-0.12)} 0 0 Z`,
    sepals: `M0 ${s(0.06)} C${s(-0.52)} 0 ${s(-0.52)} ${s(-0.34)} ${s(-0.34)} ${s(-0.66)} C${s(-0.3)} ${s(-0.3)} ${s(-0.16)} ${s(-0.14)} 0 ${s(-0.12)} C${s(0.16)} ${s(-0.14)} ${s(0.3)} ${s(-0.3)} ${s(0.34)} ${s(-0.66)} C${s(0.52)} ${s(-0.34)} ${s(0.52)} 0 0 ${s(0.06)} Z`,
  };
}

/* One petal of the bloom: a short, wide shoot, pointing up before rotation. */
export function petal(size: number): string {
  const s = size;
  return `M0 0 C${round(-s * 0.2)} ${round(-s * 0.35)} ${round(-s * 0.55)} ${round(-s * 0.75)} ${round(-s * 0.18)} ${round(-s)} Q0 ${round(-s * 0.86)} ${round(s * 0.18)} ${round(-s)} C${round(s * 0.55)} ${round(-s * 0.75)} ${round(s * 0.2)} ${round(-s * 0.35)} 0 0 Z`;
}
