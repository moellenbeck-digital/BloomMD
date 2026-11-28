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

const EPS = 1e-4;
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

/* Filled outline with a width that falls from origin to tip. Each side of the bent part is two cubic
   Béziers that follow the offset curve (position and direction at t = 0, 0.5, 1), the baseline part is
   one straight line: about a quarter of the markup of a sampled polygon. */
export function outline(shape: TriebShape, scale = 1): string {
  const [c1, c2] = controlPoints(shape);
  const { from, at, length, w } = shape;
  /* Point on one side (+1 or -1) of the bend: centerline plus the normal times half the width there. */
  const side = (t: number, sign: 1 | -1): Point => {
    const p = cubic(from, c1, c2, at, t);
    const a = cubic(from, c1, c2, at, t - EPS);
    const b = cubic(from, c1, c2, at, t + EPS);
    const norm = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const half = (sign * scale * (w[0] + (w[1] - w[0]) * (1 - (1 - t) * (1 - t)))) / 2;
    return [p[0] - ((b[1] - a[1]) / norm) * half, p[1] + ((b[0] - a[0]) / norm) * half];
  };
  const xy = (p: Point) => `${round(p[0])} ${round(p[1])}`;
  /* Hermite segment from t0 to t1 as a cubic; the derivative stays inside [0, 1]. */
  const segment = (t0: number, t1: number, sign: 1 | -1) => {
    const handle = (t: number, towards: number): Point => {
      const p = side(t, sign);
      const inner = side(t + Math.sign(towards - t) * EPS, sign);
      const k = Math.abs(towards - t) / 3 / EPS;
      return [p[0] + (inner[0] - p[0]) * k, p[1] + (inner[1] - p[1]) * k];
    };
    return `C${xy(handle(t0, t1))} ${xy(handle(t1, t0))} ${xy(side(t1, sign))}`;
  };
  const tip = at[0] + length;
  const half = (width: number) => (width * scale) / 2;
  const out = length > 0 ? ` L${tip} ${round(at[1] + half(w[2]))}` : "";
  const back = length > 0 ? ` L${tip} ${round(at[1] - half(w[2]))} L${xy(side(1, -1))}` : ` L${xy(side(1, -1))}`;
  return `M${xy(side(0, 1))} ${segment(0, 0.5, 1)} ${segment(0.5, 1, 1)}${out}${back} ${segment(1, 0.5, -1)} ${segment(0.5, 0, -1)} Z`;
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
