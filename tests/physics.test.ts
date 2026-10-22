import { describe, expect, it } from 'vitest';
import {
  DT,
  PlayerState,
  VISIBLE_LIMIT,
  WAVELENGTH_GREEN,
  bandForLogDoppler,
  dopplerFactor,
  fourVelocity,
  photonColour,
  photonFuel,
  step,
  velocity,
  wavelengthForLogDoppler,
} from '../src/physics';

function rest(fuel = 10): PlayerState {
  return { t: 0, x: 0, phi: 0, tau: 0, tauLeft: 100, fuel };
}

describe('velocity', () => {
  it('stays below light speed for any rapidity, including extreme ones', () => {
    for (const phi of [-20, -5, -1, -0.1, 0, 0.1, 1, 5, 20]) {
      expect(Math.abs(velocity(phi))).toBeLessThanOrEqual(1);
    }
    for (const phi of [-5, -1, 0, 1, 5]) {
      expect(Math.abs(velocity(phi))).toBeLessThan(1);
    }
  });

  it('never reaches c under sustained thrust', () => {
    let s = rest(1e9);
    for (let i = 0; i < 60 * 60; i++) {
      s = step(s, 1, 5);
      expect(Math.abs(velocity(s.phi))).toBeLessThan(1);
    }
    // Each step moves less than one light-step.
    expect(s.x).toBeLessThan(s.t);
  });

  it('four-velocity lies on the unit hyperbola', () => {
    for (const phi of [-3, -0.5, 0, 0.7, 2.5]) {
      const { ut, ux } = fourVelocity(phi);
      expect(ut * ut - ux * ux).toBeCloseTo(1, 10);
    }
  });
});

describe('proper time', () => {
  it('equals t / cosh(phi) at constant rapidity', () => {
    for (const phi of [0, 0.5, -1.2, 2]) {
      let s: PlayerState = { ...rest(0), phi };
      for (let i = 0; i < 600; i++) s = step(s, 0, 1);
      expect(s.tau).toBeCloseTo(s.t / Math.cosh(phi), 10);
      expect(s.tauLeft).toBeCloseTo(100 - s.t / Math.cosh(phi), 10);
      expect(s.x).toBeCloseTo(Math.tanh(phi) * s.t, 10);
    }
  });

  it('ticks slower when moving fast', () => {
    let slow = rest(0);
    let fast: PlayerState = { ...rest(0), phi: 2 };
    for (let i = 0; i < 120; i++) {
      slow = step(slow, 0, 1);
      fast = step(fast, 0, 1);
    }
    expect(fast.tau).toBeLessThan(slow.tau);
  });
});

describe('thrust and fuel', () => {
  it('changes rapidity by accel * dtau per step and charges |dphi| as fuel', () => {
    const s0: PlayerState = { ...rest(5), phi: 1 };
    const s1 = step(s0, -1, 2);
    const dtau = DT / Math.cosh(1);
    expect(s1.phi).toBeCloseTo(1 - 2 * dtau, 12);
    expect(s1.fuel).toBeCloseTo(5 - 2 * dtau, 12);
  });

  it('a symmetric speed-up/slow-down burn returns phi to 0 and uses 2 * dphi of fuel', () => {
    const accel = 1.5;
    const target = 1.2;
    let s = rest(10);
    while (s.phi < target) s = step(s, 1, accel);
    const peak = s.phi;
    while (s.phi > 0) s = step(s, -1, accel);
    // One step of overshoot at most.
    const maxStep = accel * DT;
    expect(Math.abs(s.phi)).toBeLessThan(maxStep);
    // Fuel spent is exactly the total |dphi|.
    expect(10 - s.fuel).toBeCloseTo(peak + (peak - s.phi), 10);
    expect(10 - s.fuel).toBeCloseTo(2 * peak, 1);
  });

  it('does not thrust without fuel', () => {
    const s = step(rest(0), 1, 3);
    expect(s.phi).toBe(0);
    expect(s.fuel).toBe(0);
  });

  it('cuts the last burn short so fuel never goes negative', () => {
    const s = step(rest(0.001), 1, 3);
    expect(s.phi).toBeCloseTo(0.001, 12);
    expect(s.fuel).toBe(0);
  });

  it('braking costs the same as speeding up', () => {
    const up = step({ ...rest(5), phi: 0.5 }, 1, 1);
    const down = step({ ...rest(5), phi: 0.5 }, -1, 1);
    expect(up.fuel).toBeCloseTo(down.fuel, 12);
  });
});

describe('Doppler factor', () => {
  it('is 1 at phi = 0 for a source at rest', () => {
    expect(dopplerFactor(1, 0)).toBe(1);
    expect(dopplerFactor(-1, 0)).toBe(1);
  });

  it('D(left) * D(right) = 1 at any phi for a source at rest', () => {
    for (const phi of [-3, -1, -0.2, 0, 0.4, 1.7, 3]) {
      expect(dopplerFactor(-1, phi) * dopplerFactor(1, phi)).toBeCloseTo(1, 12);
    }
  });

  it('blueshifts photons you run into and redshifts photons you run from', () => {
    // Moving right (phi > 0): left-moving photons come at you.
    expect(dopplerFactor(-1, 1)).toBeCloseTo(Math.E, 12);
    expect(dopplerFactor(1, 1)).toBeCloseTo(1 / Math.E, 12);
  });

  it('depends only on the rapidity difference to the source', () => {
    expect(dopplerFactor(1, 1.3, 0.8)).toBeCloseTo(dopplerFactor(1, 0.5, 0), 12);
  });

  it('scales fuel pickups and caps them', () => {
    expect(photonFuel(0.3, 2, 1)).toBeCloseTo(0.6, 12);
    expect(photonFuel(0.3, 10, 1)).toBe(1);
  });
});

describe('colour mapping', () => {
  it('is green at ln D = 0', () => {
    expect(wavelengthForLogDoppler(0)).toBe(WAVELENGTH_GREEN);
  });

  it('is monotonic in ln D (higher ln D = shorter wavelength)', () => {
    let prev = Infinity;
    for (let lnD = -VISIBLE_LIMIT; lnD <= VISIBLE_LIMIT + 1e-9; lnD += 0.05) {
      const w = wavelengthForLogDoppler(lnD);
      expect(w).toBeLessThan(prev);
      prev = w;
    }
  });

  it('is symmetric around green', () => {
    for (const lnD of [0.1, 0.5, 1, 1.5]) {
      const red = wavelengthForLogDoppler(-lnD) - WAVELENGTH_GREEN;
      const blue = WAVELENGTH_GREEN - wavelengthForLogDoppler(lnD);
      expect(red).toBeCloseTo(blue, 10);
    }
  });

  it('spans red to violet across the visible band', () => {
    expect(wavelengthForLogDoppler(-VISIBLE_LIMIT)).toBe(700);
    expect(wavelengthForLogDoppler(VISIBLE_LIMIT)).toBe(400);
  });

  it('classifies infrared and ultraviolet beyond +-1.5', () => {
    expect(bandForLogDoppler(-1.6)).toBe('infrared');
    expect(bandForLogDoppler(-1.5)).toBe('visible');
    expect(bandForLogDoppler(1.5)).toBe('visible');
    expect(bandForLogDoppler(1.6)).toBe('ultraviolet');
    expect(photonColour(-3).band).toBe('infrared');
    expect(photonColour(3).band).toBe('ultraviolet');
  });

  it('renders green-ish at zero shift and red at the red end', () => {
    const g = photonColour(0).css.match(/\d+/g)!.map(Number);
    expect(g[1]).toBeGreaterThan(g[0]);
    expect(g[1]).toBeGreaterThan(g[2]);
    const r = photonColour(-VISIBLE_LIMIT).css.match(/\d+/g)!.map(Number);
    expect(r).toEqual([255, 0, 0]);
  });
});
