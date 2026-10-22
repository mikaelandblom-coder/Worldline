// Special-relativistic kinematics in 1+1 dimensions, with c = 1.
// Everything here is pure so it can be unit-tested without a browser.

/** Fixed coordinate-time step used by the game loop (game units). */
export const DT = 1 / 60;

export interface PlayerState {
  /** Coordinate time. */
  t: number;
  /** Position in space. */
  x: number;
  /** Rapidity. Velocity is tanh(phi). */
  phi: number;
  /** Proper time elapsed since the start of the run. */
  tau: number;
  /** Proper time left on the decay clock. */
  tauLeft: number;
  /** Fuel, measured as a rapidity budget. */
  fuel: number;
}

/** Velocity for a rapidity; always strictly inside (-1, 1) for finite phi. */
export function velocity(phi: number): number {
  return Math.tanh(phi);
}

/** Lorentz factor gamma = cosh(phi). */
export function gamma(phi: number): number {
  return Math.cosh(phi);
}

/** Four-velocity (u^t, u^x) = (cosh phi, sinh phi); satisfies (u^t)^2 - (u^x)^2 = 1. */
export function fourVelocity(phi: number): { ut: number; ux: number } {
  return { ut: Math.cosh(phi), ux: Math.sinh(phi) };
}

/** Proper time elapsed over coordinate time dt at rapidity phi. */
export function properTimeStep(phi: number, dt: number): number {
  return dt / Math.cosh(phi);
}

/**
 * Advance the player by one coordinate-time step.
 *
 * thrust is -1, 0 or +1 (values in between are allowed). Thrust is a constant
 * proper acceleration `accel`, so dphi = thrust * accel * dtau. Fuel pays for
 * |dphi|; if the tank cannot cover a full step, the burn is cut short so fuel
 * never goes negative.
 */
export function step(state: PlayerState, thrust: number, accel: number, dt: number = DT): PlayerState {
  const dtau = properTimeStep(state.phi, dt);
  const wanted = Math.abs(thrust) * accel * dtau;
  const burn = Math.min(wanted, Math.max(0, state.fuel));
  const dphi = wanted > 0 ? Math.sign(thrust) * burn : 0;
  const phi = state.phi + dphi;
  return {
    t: state.t + dt,
    x: state.x + velocity(phi) * dt,
    phi,
    tau: state.tau + dtau,
    tauLeft: state.tauLeft - dtau,
    fuel: state.fuel - burn,
  };
}

/**
 * Relativistic Doppler factor f_seen / f_emitted in 1+1D.
 *
 * direction is the photon's direction of travel (+1 right, -1 left).
 * Right-moving: exp(phiSource - phiPlayer). Left-moving: exp(phiPlayer - phiSource).
 */
export function dopplerFactor(direction: number, phiPlayer: number, phiSource = 0): number {
  return Math.exp(-Math.sign(direction) * (phiPlayer - phiSource));
}

/** Fuel gained from absorbing a photon: baseEnergy * D, capped per pickup. */
export function photonFuel(baseEnergy: number, doppler: number, maxPickup: number): number {
  return Math.min(baseEnergy * doppler, maxPickup);
}

// --- Doppler colour mapping -------------------------------------------------

/** ln D at which the visible band ends on either side. */
export const VISIBLE_LIMIT = 1.5;
/** Wavelengths (nm) for the ends and centre of the visible band. */
export const WAVELENGTH_RED = 700;
export const WAVELENGTH_GREEN = 550;
export const WAVELENGTH_VIOLET = 400;

export type PhotonBand = 'infrared' | 'visible' | 'ultraviolet';

export interface PhotonColour {
  band: PhotonBand;
  /** Wavelength in nm, linear in ln D: green at 0, red at -1.5, violet at +1.5. Clamped to the band. */
  wavelength: number;
  /** CSS colour string. */
  css: string;
}

/** Wavelength (nm) for a log-Doppler shift, clamped to the visible band. */
export function wavelengthForLogDoppler(lnD: number): number {
  const s = Math.max(-1, Math.min(1, lnD / VISIBLE_LIMIT));
  return WAVELENGTH_GREEN - s * (WAVELENGTH_GREEN - WAVELENGTH_VIOLET);
}

export function bandForLogDoppler(lnD: number): PhotonBand {
  if (lnD < -VISIBLE_LIMIT) return 'infrared';
  if (lnD > VISIBLE_LIMIT) return 'ultraviolet';
  return 'visible';
}

/** Approximate RGB (0..255) for a visible wavelength in nm (Bruton's piecewise fit). */
export function wavelengthToRgb(nm: number): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  if (nm < 440) {
    r = (440 - nm) / (440 - 380);
    b = 1;
  } else if (nm < 490) {
    g = (nm - 440) / (490 - 440);
    b = 1;
  } else if (nm < 510) {
    g = 1;
    b = (510 - nm) / (510 - 490);
  } else if (nm < 580) {
    r = (nm - 510) / (580 - 510);
    g = 1;
  } else if (nm < 645) {
    r = 1;
    g = (645 - nm) / (645 - 580);
  } else {
    r = 1;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export function photonColour(lnD: number): PhotonColour {
  const band = bandForLogDoppler(lnD);
  const wavelength = wavelengthForLogDoppler(lnD);
  let css: string;
  if (band === 'infrared') css = 'rgb(110, 20, 20)';
  else if (band === 'ultraviolet') css = 'rgb(235, 215, 255)';
  else {
    const [r, g, b] = wavelengthToRgb(wavelength);
    css = `rgb(${r}, ${g}, ${b})`;
  }
  return { band, wavelength, css };
}
