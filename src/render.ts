// Canvas drawing: spacetime diagram, worldline, light cone, photons and HUD.

import type { Run } from './game';
import type { Rect } from './level';
import { dopplerFactor, gamma, photonColour, velocity } from './physics';

export type Screen = 'intro' | 'playing' | 'paused' | 'ended';

export interface View {
  screen: Screen;
  levelIndex: number;
  levelCount: number;
  bestStars: number;
}

const COLORS = {
  bg: '#0b0e14',
  grid: 'rgba(120, 140, 180, 0.08)',
  gridMajor: 'rgba(120, 140, 180, 0.18)',
  outside: 'rgba(0, 0, 0, 0.45)',
  text: '#d8deea',
  dim: '#7c869a',
  exit: '#3ddc84',
  block: '#e0566b',
  player: '#ffd166',
  cone: 'rgba(255, 209, 102, 0.35)',
  fuel: '#4cc9f0',
};

/** Maps game coordinates (x, t) to canvas pixels for the current frame. */
interface Camera {
  scale: number;
  x0: number;
  tBottom: number;
  w: number;
  h: number;
}

function sx(c: Camera, x: number): number {
  return (x - c.x0) * c.scale;
}
function sy(c: Camera, t: number): number {
  return c.h - (t - c.tBottom) * c.scale;
}

function makeCamera(run: Run, w: number, h: number): Camera {
  const { xMin, xMax } = run.level.bounds;
  const span = xMax - xMin + 2;
  // Same scale on both axes so light really moves at 45°; keep enough time visible to plan.
  const scale = Math.min(w / span, h / 12);
  const x0 = (xMin + xMax) / 2 - w / scale / 2;
  const tBottom = Math.max(run.player.t - (h / scale) * 0.25, run.level.start.t - 1);
  return { scale, x0, tBottom, w, h };
}

export function render(ctx: CanvasRenderingContext2D, run: Run, view: View): void {
  const w = ctx.canvas.clientWidth;
  const h = ctx.canvas.clientHeight;
  const cam = makeCamera(run, w, h);
  const tTop = cam.tBottom + h / cam.scale;

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, w, h);

  drawGrid(ctx, cam, tTop);
  drawBounds(ctx, run, cam, tTop);
  drawRect(ctx, cam, run.level.exit, COLORS.exit, 'EXIT');
  for (const b of run.level.blocks) drawRect(ctx, cam, b, COLORS.block, '');
  drawEmitters(ctx, run, cam, tTop);
  drawPhotons(ctx, run, cam, tTop);
  drawNowLine(ctx, run, cam);
  drawLightCone(ctx, run, cam, tTop);
  drawWorldline(ctx, run, cam);
  drawPickups(ctx, run, cam);
  drawHud(ctx, run, view, w);
  drawOverlay(ctx, run, view, w, h);
}

function drawGrid(ctx: CanvasRenderingContext2D, cam: Camera, tTop: number): void {
  const xLeft = cam.x0;
  const xRight = cam.x0 + cam.w / cam.scale;
  ctx.lineWidth = 1;
  for (let x = Math.ceil(xLeft); x <= xRight; x++) {
    ctx.strokeStyle = x % 5 === 0 ? COLORS.gridMajor : COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(Math.round(sx(cam, x)) + 0.5, 0);
    ctx.lineTo(Math.round(sx(cam, x)) + 0.5, cam.h);
    ctx.stroke();
  }
  for (let t = Math.ceil(cam.tBottom); t <= tTop; t++) {
    ctx.strokeStyle = t % 5 === 0 ? COLORS.gridMajor : COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(sy(cam, t)) + 0.5);
    ctx.lineTo(cam.w, Math.round(sy(cam, t)) + 0.5);
    ctx.stroke();
    if (t % 5 === 0) {
      ctx.fillStyle = COLORS.dim;
      ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`t=${t}`, cam.w - 6, sy(cam, t) - 3);
    }
  }
}

function drawBounds(ctx: CanvasRenderingContext2D, run: Run, cam: Camera, tTop: number): void {
  const { xMin, xMax, tMax } = run.level.bounds;
  ctx.fillStyle = COLORS.outside;
  ctx.fillRect(0, 0, sx(cam, xMin), cam.h);
  ctx.fillRect(sx(cam, xMax), 0, cam.w - sx(cam, xMax), cam.h);
  if (tMax < tTop) ctx.fillRect(0, 0, cam.w, sy(cam, tMax));
}

function drawRect(ctx: CanvasRenderingContext2D, cam: Camera, r: Rect, color: string, label: string): void {
  const x = sx(cam, r.x0);
  const y = sy(cam, r.t1);
  const rw = (r.x1 - r.x0) * cam.scale;
  const rh = (r.t1 - r.t0) * cam.scale;
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, rw, rh);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, rw, rh);
  if (label) {
    ctx.fillStyle = color;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const ty = Math.min(Math.max(y + rh - 8, 18), cam.h - 8);
    ctx.fillText(label, x + rw / 2, ty);
  }
}

function drawEmitters(ctx: CanvasRenderingContext2D, run: Run, cam: Camera, tTop: number): void {
  ctx.setLineDash([2, 6]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = COLORS.dim;
  for (const e of run.level.emitters) {
    ctx.beginPath();
    ctx.moveTo(sx(cam, e.x), sy(cam, Math.max(cam.tBottom, run.level.start.t)));
    ctx.lineTo(sx(cam, e.x), sy(cam, Math.min(tTop, run.level.bounds.tMax)));
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawPhotons(ctx: CanvasRenderingContext2D, run: Run, cam: Camera, tTop: number): void {
  const absorbedAt = new Map<number, number>();
  for (const p of run.pickups) absorbedAt.set(p.photon, p.t);
  const { xMin, xMax, tMax } = run.level.bounds;
  const tLimit = Math.min(tTop, tMax);

  run.photons.forEach((p, i) => {
    // A photon's worldline runs from its emission event until it leaves the level or is absorbed.
    const tExit = p.direction > 0 ? p.t + (xMax - p.x) : p.t + (p.x - xMin);
    let tEnd = Math.min(tExit, tLimit);
    const absorbed = absorbedAt.get(i);
    if (absorbed !== undefined) tEnd = Math.min(tEnd, absorbed);
    const tStart = Math.max(p.t, cam.tBottom);
    if (tEnd <= tStart) return;

    const lnD = Math.log(dopplerFactor(p.direction, run.player.phi, p.phiSource));
    const colour = photonColour(lnD);
    const xAt = (t: number) => p.x + p.direction * (t - p.t);

    ctx.save();
    if (colour.band === 'infrared') {
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.7;
    } else if (colour.band === 'ultraviolet') {
      ctx.shadowColor = 'rgb(190, 120, 255)';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 3;
    } else {
      ctx.lineWidth = 2;
    }
    ctx.strokeStyle = colour.css;
    ctx.beginPath();
    ctx.moveTo(sx(cam, xAt(tStart)), sy(cam, tStart));
    ctx.lineTo(sx(cam, xAt(tEnd)), sy(cam, tEnd));
    ctx.stroke();
    ctx.restore();
  });
}

function drawNowLine(ctx: CanvasRenderingContext2D, run: Run, cam: Camera): void {
  const y = sy(cam, run.player.t);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(cam.w, y);
  ctx.stroke();
}

function drawLightCone(ctx: CanvasRenderingContext2D, run: Run, cam: Camera, tTop: number): void {
  const { t, x } = run.player;
  const dt = tTop - t;
  const px = sx(cam, x);
  const py = sy(cam, t);
  const ly = sy(cam, tTop);
  ctx.fillStyle = 'rgba(255, 209, 102, 0.04)';
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(sx(cam, x - dt), ly);
  ctx.lineTo(sx(cam, x + dt), ly);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = COLORS.cone;
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(sx(cam, x - dt), ly);
  ctx.lineTo(px, py);
  ctx.lineTo(sx(cam, x + dt), ly);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawWorldline(ctx: CanvasRenderingContext2D, run: Run, cam: Camera): void {
  const trail = run.trail;
  ctx.strokeStyle = COLORS.player;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.shadowColor = COLORS.player;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  let started = false;
  for (const e of trail) {
    if (e.t < cam.tBottom - 1) continue;
    const X = sx(cam, e.x);
    const Y = sy(cam, e.t);
    if (!started) {
      ctx.moveTo(X, Y);
      started = true;
    } else ctx.lineTo(X, Y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Clock ticks: one mark per unit of proper time. They spread out in t as you speed up.
  ctx.fillStyle = '#fff';
  let next = 1;
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1];
    const b = trail[i];
    while (b.tau >= next) {
      const u = (next - a.tau) / (b.tau - a.tau || 1);
      const t = a.t + u * (b.t - a.t);
      const x = a.x + u * (b.x - a.x);
      if (t >= cam.tBottom) {
        ctx.beginPath();
        ctx.arc(sx(cam, x), sy(cam, t), 3, 0, Math.PI * 2);
        ctx.fill();
      }
      next++;
    }
  }

  // Current event, with a flame showing thrust direction.
  const px = sx(cam, run.player.x);
  const py = sy(cam, run.player.t);
  if (run.thrust !== 0 && run.outcome.kind === 'playing') {
    ctx.fillStyle = 'rgba(255, 140, 60, 0.85)';
    ctx.beginPath();
    ctx.moveTo(px - run.thrust * 6, py - 4);
    ctx.lineTo(px - run.thrust * (16 + Math.random() * 6), py);
    ctx.lineTo(px - run.thrust * 6, py + 4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = run.outcome.kind === 'lost' ? COLORS.block : COLORS.player;
  ctx.beginPath();
  ctx.arc(px, py, 6, 0, Math.PI * 2);
  ctx.fill();
}

function drawPickups(ctx: CanvasRenderingContext2D, run: Run, cam: Camera): void {
  ctx.font = 'bold 12px ui-monospace, monospace';
  ctx.textAlign = 'left';
  for (const p of run.pickups) {
    const age = run.player.t - p.t;
    if (age > 1.5) continue;
    ctx.globalAlpha = 1 - age / 1.5;
    ctx.fillStyle = photonColour(p.lnD).css;
    ctx.fillText(`+${p.fuel.toFixed(2)}`, sx(cam, p.x) + 10, sy(cam, p.t) - age * 20);
  }
  ctx.globalAlpha = 1;
}

function drawHud(ctx: CanvasRenderingContext2D, run: Run, view: View, w: number): void {
  const p = run.player;
  const lvl = run.level;
  const pad = 16;

  // Panel behind the readouts.
  ctx.fillStyle = 'rgba(11, 14, 20, 0.78)';
  ctx.fillRect(pad - 8, pad - 8, 196, 150);

  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.dim;
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('PROPER TIME LEFT', pad, pad + 6);
  const frac = Math.max(0, p.tauLeft) / lvl.decayClock;
  ctx.fillStyle = frac < 0.2 ? COLORS.block : COLORS.text;
  ctx.font = 'bold 32px ui-monospace, monospace';
  ctx.fillText(Math.max(0, p.tauLeft).toFixed(2), pad, pad + 40);

  ctx.font = '13px ui-monospace, monospace';
  ctx.fillStyle = COLORS.text;
  const v = velocity(p.phi);
  ctx.fillText(`t  ${p.t.toFixed(2)}`, pad, pad + 64);
  ctx.fillText(`v  ${v >= 0 ? ' ' : '−'}${Math.abs(v).toFixed(3)} c`, pad, pad + 82);
  ctx.fillText(`γ  ${gamma(p.phi).toFixed(3)}`, pad, pad + 100);

  ctx.fillStyle = COLORS.dim;
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('FUEL', pad, pad + 120);
  const barX = pad + 36;
  const barW = 140;
  ctx.strokeStyle = COLORS.dim;
  ctx.lineWidth = 1;
  ctx.strokeRect(barX + 0.5, pad + 111.5, barW, 10);
  ctx.fillStyle = COLORS.fuel;
  ctx.fillRect(barX + 1, pad + 112, (barW - 1) * Math.min(1, p.fuel / lvl.maxFuel), 9);
  ctx.fillStyle = COLORS.dim;
  ctx.fillText(p.fuel.toFixed(2), barX, pad + 136);

  // Level title.
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText(`${view.levelIndex + 1}. ${lvl.name}`, w - pad, pad + 10);
  ctx.fillStyle = COLORS.dim;
  ctx.font = '12px system-ui, sans-serif';
  const best = view.bestStars > 0 ? `best ${'★'.repeat(view.bestStars)}${'☆'.repeat(3 - view.bestStars)}` : '';
  ctx.fillText(best, w - pad, pad + 28);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function drawOverlay(ctx: CanvasRenderingContext2D, run: Run, view: View, w: number, h: number): void {
  let title = '';
  let body: string[] = [];
  let colour = COLORS.text;
  const touch = matchMedia('(pointer: coarse)').matches;
  const steer = touch ? 'Hold the left or right half of the screen to thrust.' : '← / → (or A / D) to thrust · Space pause · R restart';

  if (view.screen === 'intro') {
    title = `${view.levelIndex + 1}. ${run.level.name}`;
    body = [run.level.hint, steer, touch ? 'Touch to start.' : 'Click or press an arrow key to start.'];
  } else if (view.screen === 'paused') {
    title = 'Paused';
    body = ['Space to resume · R to restart'];
  } else if (view.screen === 'ended') {
    const o = run.outcome;
    const last = view.levelIndex === view.levelCount - 1;
    if (o.kind === 'won') {
      colour = COLORS.exit;
      title = `${'★'.repeat(o.stars)}${'☆'.repeat(3 - o.stars)}`;
      body = [
        `You made it with ${o.tauLeft.toFixed(2)} of proper time left.`,
        `${run.player.t.toFixed(2)} passed in the lab; only ${run.player.tau.toFixed(2)} passed for you.`,
        last ? 'That was the last level. R to replay, 1–6 to pick a level.' : touch ? 'Touch to continue.' : 'Enter for the next level · R to retry',
      ];
    } else if (o.kind === 'lost') {
      colour = COLORS.block;
      const why = {
        decayed: ['You decayed.', 'Your clock ran out. Move faster: a fast clock ticks slower.'],
        block: ['You hit a block.', 'Blocks only exist for a while. Arrive before they appear or after they vanish.'],
        bounds: ['You left the level.', 'Stay between the shaded edges, and reach the exit before the top.'],
      }[o.reason];
      title = why[0];
      body = [why[1], touch ? 'Touch to retry.' : 'R to retry'];
    }
  } else return;

  const boxW = Math.min(520, w - 32);
  ctx.font = '14px system-ui, sans-serif';
  const lines = body.flatMap((b) => wrap(ctx, b, boxW - 40));
  const boxH = 70 + lines.length * 22;
  const bx = (w - boxW) / 2;
  const by = h * 0.42 - boxH / 2;
  ctx.fillStyle = 'rgba(11, 14, 20, 0.9)';
  ctx.fillRect(bx, by, boxW, boxH);
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by + 0.5, boxW, boxH);
  ctx.textAlign = 'center';
  ctx.fillStyle = colour;
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText(title, w / 2, by + 38);
  ctx.fillStyle = COLORS.text;
  ctx.font = '14px system-ui, sans-serif';
  lines.forEach((l, i) => ctx.fillText(l, w / 2, by + 68 + i * 22));
}
