import { describe, expect, it } from 'vitest';
import { segmentPhotonCrossing, segmentRectEntry } from '../src/collision';
import { createRun, tick, type Run } from '../src/game';
import { LevelError, parseLevel, photonsForLevel, starsFor, type Level } from '../src/level';
import { LEVELS } from '../src/levels';

const baseLevel = {
  name: 'test',
  start: { x: 0, t: 0, phi: 0 },
  decayClock: 10,
  fuel: 2,
  accel: 1,
  bounds: { xMin: -5, xMax: 20, tMax: 30 },
  exit: { x0: 10, x1: 12, t0: 0, t1: 30 },
};

function level(overrides: Record<string, unknown> = {}): Level {
  return parseLevel({ ...baseLevel, ...overrides });
}

/** Run a level with a policy until it ends (or a step cap). */
function play(lvl: Level, policy: (run: Run) => number, maxSteps = 60 * 200): Run {
  const run = createRun(lvl);
  for (let i = 0; i < maxSteps && run.outcome.kind === 'playing'; i++) tick(run, policy(run));
  return run;
}

/** Steer to arrive at x by time t. */
function arrive(run: Run, x: number, t: number): number {
  const v = (x - run.player.x) / Math.max(0.01, t - run.player.t);
  return toward(run, Math.atanh(Math.max(-0.99, Math.min(0.99, v))));
}

/** Thrust toward a target rapidity. */
function toward(run: Run, phi: number): number {
  const d = phi - run.player.phi;
  if (Math.abs(d) < 0.02) return 0;
  return Math.sign(d);
}

describe('segmentRectEntry', () => {
  const r = { x0: 0, x1: 1, t0: 0, t1: 1 };
  it('finds the entry parameter', () => {
    expect(segmentRectEntry({ ta: 0.5, xa: -1, tb: 0.5, xb: 1 }, r)).toBeCloseTo(0.5);
    expect(segmentRectEntry({ ta: -1, xa: 0.5, tb: 1, xb: 0.5 }, r)).toBeCloseTo(0.5);
  });
  it('returns 0 when starting inside', () => {
    expect(segmentRectEntry({ ta: 0.5, xa: 0.5, tb: 0.6, xb: 0.6 }, r)).toBe(0);
  });
  it('returns null on a miss', () => {
    expect(segmentRectEntry({ ta: 2, xa: 0, tb: 3, xb: 1 }, r)).toBeNull();
    expect(segmentRectEntry({ ta: 0, xa: -1, tb: 0.5, xb: -0.1 }, r)).toBeNull();
  });
  it('catches a segment cutting a corner', () => {
    expect(segmentRectEntry({ ta: 0.5, xa: -0.4, tb: 1.5, xb: 0.6 }, r)).not.toBeNull();
  });
});

describe('segmentPhotonCrossing', () => {
  const photon = { x: 5, t: 0, direction: -1 as const, baseEnergy: 1, phiSource: 0 };
  it('detects crossing a photon worldline', () => {
    // Photon at x = 5 - t; at t = 2.5 it is at 2.5.
    const u = segmentPhotonCrossing({ ta: 2, xa: 2.5, tb: 3, xb: 2.5 }, photon);
    expect(u).toBeCloseTo(0.5);
  });
  it('ignores the line before the photon is emitted', () => {
    expect(segmentPhotonCrossing({ ta: -2, xa: 6.5, tb: -1, xb: 6.5 }, photon)).toBeNull();
  });
  it('counts a crossing once across consecutive segments', () => {
    const a = segmentPhotonCrossing({ ta: 2, xa: 2.5, tb: 2.5, xb: 2.5 }, photon);
    const b = segmentPhotonCrossing({ ta: 2.5, xa: 2.5, tb: 3, xb: 2.5 }, photon);
    expect([a, b].filter((u) => u !== null)).toHaveLength(1);
  });
});

describe('parseLevel', () => {
  it('fills in defaults', () => {
    const l = level();
    expect(l.blocks).toEqual([]);
    expect(l.emitters).toEqual([]);
    expect(l.maxFuel).toBe(2);
    expect(l.stars).toEqual([2.5, 5]);
  });
  it('rejects bad data', () => {
    expect(() => parseLevel(null)).toThrow(LevelError);
    expect(() => level({ decayClock: -1 })).toThrow(LevelError);
    expect(() => level({ exit: { x0: 2, x1: 1, t0: 0, t1: 1 } })).toThrow(LevelError);
    expect(() => level({ blocks: [{ x0: -1, x1: 1, t0: -1, t1: 1 }] })).toThrow(/start/);
    expect(() => level({ emitters: [{ x: 0, direction: 2, tStart: 0, period: 1, baseEnergy: 1 }] })).toThrow(/direction/);
  });
  it('expands emitters into photons', () => {
    const l = level({ emitters: [{ x: 15, direction: -1, tStart: 1, period: 10, baseEnergy: 0.5 }] });
    expect(photonsForLevel(l).map((p) => p.t)).toEqual([1, 11, 21]);
  });
  it('awards stars by proper time left', () => {
    const l = level({ stars: [2, 4] });
    expect(starsFor(l, 1)).toBe(1);
    expect(starsFor(l, 2)).toBe(2);
    expect(starsFor(l, 5)).toBe(3);
  });
});

describe('run outcomes', () => {
  it('wins on reaching the exit, scoring proper time left', () => {
    const run = play(level(), (r) => toward(r, 1));
    expect(run.outcome.kind).toBe('won');
    if (run.outcome.kind === 'won') {
      expect(run.outcome.tauLeft).toBeCloseTo(run.player.tauLeft, 10);
      expect(run.player.x).toBeCloseTo(10, 6);
    }
  });
  it('decays when standing still', () => {
    const run = play(level(), () => 0);
    expect(run.outcome).toEqual({ kind: 'lost', reason: 'decayed' });
    expect(run.player.tauLeft).toBeCloseTo(0, 10);
    expect(run.player.t).toBeCloseTo(10, 10);
  });
  it('loses on touching a block', () => {
    const run = play(level({ blocks: [{ x0: 4, x1: 5, t0: 0, t1: 30 }] }), (r) => toward(r, 1));
    expect(run.outcome).toEqual({ kind: 'lost', reason: 'block' });
    expect(run.player.x).toBeCloseTo(4, 6);
  });
  it('loses on leaving the bounds', () => {
    const run = play(level(), (r) => toward(r, -1));
    expect(run.outcome).toEqual({ kind: 'lost', reason: 'bounds' });
    expect(run.player.x).toBeCloseTo(-5, 6);
  });
  it('gives Doppler-scaled fuel for photons', () => {
    const emitters = [
      { x: 19, direction: -1, tStart: 0, period: 100, baseEnergy: 0.1 },
      { x: -1, direction: 1, tStart: 0, period: 100, baseEnergy: 0.1 },
    ];
    const lvl = level({ emitters, fuel: 1, maxFuel: 5, decayClock: 30, exit: { x0: 18, x1: 19, t0: 25, t1: 30 } });
    const run = play(lvl, (r) => (r.player.phi < 1 ? 1 : 0), 60 * 15);
    expect(run.pickups).toHaveLength(2);
    const head = run.pickups.find((p) => run.photons[p.photon].direction === -1)!;
    const tail = run.pickups.find((p) => run.photons[p.photon].direction === 1)!;
    expect(head.fuel).toBeCloseTo(0.1 * Math.exp(1), 1);
    expect(tail.fuel).toBeCloseTo(0.1 * Math.exp(-1), 1);
    expect(head.lnD).toBeGreaterThan(0);
    expect(tail.lnD).toBeLessThan(0);
  });
});

describe('Draft 1 levels', () => {
  it('has six valid levels', () => {
    expect(LEVELS).toHaveLength(6);
  });

  it('level 1 is won by a gentle push', () => {
    const run = play(LEVELS[0], (r) => toward(r, 0.6));
    expect(run.outcome.kind).toBe('won');
  });

  it('level 2 is lost going slowly and won going fast', () => {
    expect(play(LEVELS[1], (r) => toward(r, 1)).outcome.kind).toBe('lost');
    expect(play(LEVELS[1], (r) => toward(r, 3)).outcome.kind).toBe('won');
  });

  it('level 3 is won by waiting, then dashing', () => {
    const run = play(LEVELS[2], (r) => (r.player.t < 5.5 ? arrive(r, 2, 5.5) : toward(r, 2)));
    expect(run.outcome.kind).toBe('won');
    expect(play(LEVELS[2], (r) => toward(r, 1.5)).outcome.kind).toBe('lost');
  });

  it('level 4 needs a brake', () => {
    const noBrake = play(LEVELS[3], (r) => toward(r, 1));
    expect(noBrake.outcome.kind).toBe('lost');
    const brake = play(LEVELS[3], (r) => (r.player.x < 4 ? toward(r, 1) : arrive(r, 7.5, 15)));
    expect(brake.outcome.kind).toBe('won');
  });

  it('level 5 needs blueshifted photons', () => {
    const run = play(LEVELS[4], (r) => toward(r, 3));
    expect(run.outcome.kind).toBe('won');
    expect(run.pickups.length).toBeGreaterThan(0);
    // Without pickups the starting fuel is not enough.
    const noPhotons = play({ ...LEVELS[4], emitters: [] }, (r) => toward(r, 3));
    expect(noPhotons.outcome.kind).toBe('lost');
  });

  it('level 6 is winnable', () => {
    const run = play(LEVELS[5], (r) => (r.player.t < 3 ? arrive(r, 2, 5) : toward(r, 3)));
    expect(run.outcome.kind).toBe('won');
  });
});
