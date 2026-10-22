// One play-through of a level: physics step plus win/lose and pickups.
// Pure and DOM-free so it can be tested and driven by scripted players.

import { segmentPhotonCrossing, segmentRectEntry, type Segment } from './collision';
import { photonsForLevel, starsFor, type Level, type Photon } from './level';
import { DT, dopplerFactor, photonFuel, step, type PlayerState } from './physics';

export type Outcome =
  | { kind: 'playing' }
  | { kind: 'won'; tauLeft: number; stars: 1 | 2 | 3 }
  | { kind: 'lost'; reason: 'decayed' | 'block' | 'bounds' };

export interface Pickup {
  photon: number;
  t: number;
  x: number;
  fuel: number;
  lnD: number;
}

export interface Run {
  level: Level;
  player: PlayerState;
  /** Recorded events of the worldline (with proper time elapsed), oldest first. */
  trail: Array<{ t: number; x: number; tau: number }>;
  photons: Photon[];
  /** collected[i] is true once photon i has been absorbed. */
  collected: boolean[];
  pickups: Pickup[];
  outcome: Outcome;
  /** Last thrust actually applied (for drawing the exhaust). */
  thrust: number;
}

export function createRun(level: Level): Run {
  const photons = photonsForLevel(level);
  const run: Run = {
    level,
    player: {
      t: level.start.t,
      x: level.start.x,
      phi: level.start.phi,
      tau: 0,
      tauLeft: level.decayClock,
      fuel: level.fuel,
    },
    trail: [{ t: level.start.t, x: level.start.x, tau: 0 }],
    photons,
    collected: photons.map(() => false),
    pickups: [],
    outcome: { kind: 'playing' },
    thrust: 0,
  };
  // Starting inside the exit wins immediately.
  if (segmentRectEntry({ ta: level.start.t, xa: level.start.x, tb: level.start.t, xb: level.start.x }, level.exit) !== null) {
    run.outcome = { kind: 'won', tauLeft: level.decayClock, stars: starsFor(level, level.decayClock) };
  }
  return run;
}

type Event = { u: number; apply: () => void };

/** Advance the run by one fixed step with the given thrust (-1, 0, +1). Mutates and returns run. */
export function tick(run: Run, thrust: number, dt: number = DT): Run {
  if (run.outcome.kind !== 'playing') return run;
  const { level } = run;
  const before = run.player;
  const after = step(before, before.fuel > 0 ? thrust : 0, level.accel, dt);
  run.thrust = before.fuel > 0 ? thrust : 0;
  const seg: Segment = { ta: before.t, xa: before.x, tb: after.t, xb: after.x };
  const at = (u: number) => ({ t: seg.ta + u * (seg.tb - seg.ta), x: seg.xa + u * (seg.xb - seg.xa) });

  // Terminal events within this step; the earliest one decides the outcome.
  const events: Event[] = [];
  const dtau = before.tauLeft - after.tauLeft;

  const exitU = segmentRectEntry(seg, level.exit);
  if (exitU !== null) {
    events.push({
      u: exitU,
      apply: () => {
        const tauLeft = before.tauLeft - exitU * dtau;
        run.outcome = { kind: 'won', tauLeft, stars: starsFor(level, tauLeft) };
      },
    });
  }
  for (const b of level.blocks) {
    const u = segmentRectEntry(seg, b);
    if (u !== null) events.push({ u, apply: () => (run.outcome = { kind: 'lost', reason: 'block' }) });
  }
  if (after.tauLeft <= 0) {
    events.push({ u: before.tauLeft / dtau, apply: () => (run.outcome = { kind: 'lost', reason: 'decayed' }) });
  }
  const { xMin, xMax, tMax } = level.bounds;
  if (after.x < xMin || after.x > xMax || after.t > tMax) {
    const us = [1];
    if (after.x < xMin) us.push((xMin - seg.xa) / (seg.xb - seg.xa));
    if (after.x > xMax) us.push((xMax - seg.xa) / (seg.xb - seg.xa));
    if (after.t > tMax) us.push((tMax - seg.ta) / (seg.tb - seg.ta));
    events.push({ u: Math.min(...us), apply: () => (run.outcome = { kind: 'lost', reason: 'bounds' }) });
  }

  let endU = 1;
  if (events.length > 0) {
    // Ties go to the earliest-listed event, so touching the exit beats a block on the same event.
    const first = events.reduce((a, b) => (b.u < a.u ? b : a));
    endU = Math.max(0, Math.min(1, first.u));
    first.apply();
  }

  // Photon pickups up to the end of the step (or the terminal event).
  let fuel = after.fuel;
  for (let i = 0; i < run.photons.length; i++) {
    if (run.collected[i]) continue;
    const p = run.photons[i];
    const u = segmentPhotonCrossing(seg, p);
    if (u === null || u > endU) continue;
    const d = dopplerFactor(p.direction, after.phi, p.phiSource);
    const gain = Math.min(photonFuel(p.baseEnergy, d, level.maxPickup), level.maxFuel - fuel);
    fuel += Math.max(0, gain);
    run.collected[i] = true;
    const ev = at(u);
    run.pickups.push({ photon: i, t: ev.t, x: ev.x, fuel: Math.max(0, gain), lnD: Math.log(d) });
  }

  if (endU < 1) {
    const ev = at(endU);
    run.player = { ...after, t: ev.t, x: ev.x, tau: before.tau + endU * dtau, tauLeft: before.tauLeft - endU * dtau, fuel };
  } else {
    run.player = { ...after, fuel };
  }
  run.trail.push({ t: run.player.t, x: run.player.x, tau: run.player.tau });
  return run;
}
