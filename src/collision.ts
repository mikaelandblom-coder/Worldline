// Worldline segment tests against spacetime rectangles and photon lines.

import type { Photon, Rect } from './level';

/** A straight piece of worldline from event (ta, xa) to event (tb, xb). */
export interface Segment {
  ta: number;
  xa: number;
  tb: number;
  xb: number;
}

/**
 * First parameter u in [0, 1] at which the segment touches the closed
 * rectangle, or null if it never does (Liang–Barsky clipping).
 */
export function segmentRectEntry(seg: Segment, r: Rect): number | null {
  const dt = seg.tb - seg.ta;
  const dx = seg.xb - seg.xa;
  let u0 = 0;
  let u1 = 1;
  // Each pair is (p, q) for the inequality p * u <= q.
  const edges: Array<[number, number]> = [
    [-dx, seg.xa - r.x0],
    [dx, r.x1 - seg.xa],
    [-dt, seg.ta - r.t0],
    [dt, r.t1 - seg.ta],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const u = q / p;
      if (p < 0) {
        if (u > u1) return null;
        if (u > u0) u0 = u;
      } else {
        if (u < u0) return null;
        if (u < u1) u1 = u;
      }
    }
  }
  return u0;
}

/** Signed offset of event (t, x) from the photon's worldline x = xe + d (t - te). */
function photonSide(p: Photon, t: number, x: number): number {
  return x - p.x - p.direction * (t - p.t);
}

/**
 * Parameter u in [0, 1] at which the segment crosses the photon's worldline,
 * or null. The crossing must happen after the photon is emitted. A segment
 * that ends exactly on the line counts; one that starts on it does not, so
 * consecutive segments never collect the same photon twice.
 */
export function segmentPhotonCrossing(seg: Segment, p: Photon): number | null {
  const fa = photonSide(p, seg.ta, seg.xa);
  const fb = photonSide(p, seg.tb, seg.xb);
  if (fa < 0 === fb < 0) return null;
  const u = fa / (fa - fb);
  const t = seg.ta + u * (seg.tb - seg.ta);
  if (t < p.t) return null;
  return u;
}
