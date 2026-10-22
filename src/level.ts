// Level data: loading and validation of the JSON level format.

export interface Rect {
  x0: number;
  x1: number;
  t0: number;
  t1: number;
}

export interface Emitter {
  /** Position of the emitter (at rest). */
  x: number;
  /** Direction photons travel: -1 left, +1 right. */
  direction: -1 | 1;
  /** Coordinate time of the first photon. */
  tStart: number;
  /** Coordinate time between photons. */
  period: number;
  /** Fuel given by a photon at D = 1. */
  baseEnergy: number;
}

export interface Level {
  name: string;
  /** One-line hint shown at the start of the level. */
  hint: string;
  start: { x: number; t: number; phi: number };
  decayClock: number;
  fuel: number;
  /** Fuel tank size; defaults to the starting fuel (or 1 if that is 0). */
  maxFuel: number;
  /** Largest fuel gain from a single photon. */
  maxPickup: number;
  accel: number;
  bounds: { xMin: number; xMax: number; tMax: number };
  exit: Rect;
  blocks: Rect[];
  emitters: Emitter[];
  /** Proper-time-left thresholds for 2 and 3 stars (1 star for any win). */
  stars: [number, number];
}

export class LevelError extends Error {}

function num(obj: Record<string, unknown>, key: string, where: string): number {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new LevelError(`${where}.${key} must be a finite number`);
  }
  return v;
}

function record(v: unknown, where: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new LevelError(`${where} must be an object`);
  }
  return v as Record<string, unknown>;
}

function rect(v: unknown, where: string): Rect {
  const o = record(v, where);
  const r = { x0: num(o, 'x0', where), x1: num(o, 'x1', where), t0: num(o, 't0', where), t1: num(o, 't1', where) };
  if (r.x1 <= r.x0) throw new LevelError(`${where}: x1 must be greater than x0`);
  if (r.t1 <= r.t0) throw new LevelError(`${where}: t1 must be greater than t0`);
  return r;
}

function inside(r: Rect, x: number, t: number): boolean {
  return x >= r.x0 && x <= r.x1 && t >= r.t0 && t <= r.t1;
}

/** Validate untrusted level JSON and fill in defaults. Throws LevelError on bad data. */
export function parseLevel(json: unknown): Level {
  const o = record(json, 'level');
  if (typeof o.name !== 'string' || o.name.length === 0) throw new LevelError('level.name must be a non-empty string');
  const hint = typeof o.hint === 'string' ? o.hint : '';

  const s = record(o.start, 'start');
  const start = { x: num(s, 'x', 'start'), t: num(s, 't', 'start'), phi: num(s, 'phi', 'start') };

  const decayClock = num(o, 'decayClock', 'level');
  const fuel = num(o, 'fuel', 'level');
  const accel = num(o, 'accel', 'level');
  if (decayClock <= 0) throw new LevelError('level.decayClock must be positive');
  if (fuel < 0) throw new LevelError('level.fuel must not be negative');
  if (accel <= 0) throw new LevelError('level.accel must be positive');
  const maxFuel = o.maxFuel === undefined ? (fuel > 0 ? fuel : 1) : num(o, 'maxFuel', 'level');
  if (maxFuel < fuel || maxFuel <= 0) throw new LevelError('level.maxFuel must be positive and at least level.fuel');
  const maxPickup = o.maxPickup === undefined ? 1 : num(o, 'maxPickup', 'level');
  if (maxPickup <= 0) throw new LevelError('level.maxPickup must be positive');

  const b = record(o.bounds, 'bounds');
  const bounds = { xMin: num(b, 'xMin', 'bounds'), xMax: num(b, 'xMax', 'bounds'), tMax: num(b, 'tMax', 'bounds') };
  if (bounds.xMax <= bounds.xMin) throw new LevelError('bounds.xMax must be greater than bounds.xMin');
  if (bounds.tMax <= start.t) throw new LevelError('bounds.tMax must be after start.t');
  if (start.x < bounds.xMin || start.x > bounds.xMax) throw new LevelError('start.x is outside the level bounds');

  const exit = rect(o.exit, 'exit');

  const blocksRaw = o.blocks ?? [];
  if (!Array.isArray(blocksRaw)) throw new LevelError('level.blocks must be an array');
  const blocks = blocksRaw.map((v, i) => rect(v, `blocks[${i}]`));
  blocks.forEach((r, i) => {
    if (inside(r, start.x, start.t)) throw new LevelError(`blocks[${i}] contains the start event`);
  });

  const emittersRaw = o.emitters ?? [];
  if (!Array.isArray(emittersRaw)) throw new LevelError('level.emitters must be an array');
  const emitters = emittersRaw.map((v, i): Emitter => {
    const where = `emitters[${i}]`;
    const e = record(v, where);
    const direction = num(e, 'direction', where);
    if (direction !== 1 && direction !== -1) throw new LevelError(`${where}.direction must be -1 or 1`);
    const period = num(e, 'period', where);
    if (period <= 0) throw new LevelError(`${where}.period must be positive`);
    const baseEnergy = num(e, 'baseEnergy', where);
    if (baseEnergy < 0) throw new LevelError(`${where}.baseEnergy must not be negative`);
    return { x: num(e, 'x', where), direction, tStart: num(e, 'tStart', where), period, baseEnergy };
  });

  let stars: [number, number] = [decayClock * 0.25, decayClock * 0.5];
  if (o.stars !== undefined) {
    if (!Array.isArray(o.stars) || o.stars.length !== 2 || !o.stars.every((v) => typeof v === 'number')) {
      throw new LevelError('level.stars must be [twoStarTauLeft, threeStarTauLeft]');
    }
    stars = [o.stars[0], o.stars[1]];
    if (stars[1] < stars[0]) throw new LevelError('level.stars must be in increasing order');
  }

  return { name: o.name, hint, start, decayClock, fuel, maxFuel, maxPickup, accel, bounds, exit, blocks, emitters, stars };
}

export interface Photon {
  /** Emission event. */
  x: number;
  t: number;
  direction: -1 | 1;
  baseEnergy: number;
  /** Emitter rapidity (always 0 in Draft 1). */
  phiSource: number;
}

/** Every photon the level's emitters fire before tMax, ordered by emitter then time. */
export function photonsForLevel(level: Level): Photon[] {
  const out: Photon[] = [];
  for (const e of level.emitters) {
    for (let t = e.tStart; t <= level.bounds.tMax; t += e.period) {
      out.push({ x: e.x, t, direction: e.direction, baseEnergy: e.baseEnergy, phiSource: 0 });
    }
  }
  return out;
}

/** Stars earned for a win with the given proper time left (1 to 3). */
export function starsFor(level: Level, tauLeft: number): 1 | 2 | 3 {
  if (tauLeft >= level.stars[1]) return 3;
  if (tauLeft >= level.stars[0]) return 2;
  return 1;
}
