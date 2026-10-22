// Main menu: level selector over an animated spacetime diagram.

import type { Level } from './level';
import { photonColour } from './physics';

const C = {
  bg: '#0b0e14',
  grid: 'rgba(120, 140, 180, 0.07)',
  hyperbola: 'rgba(150, 170, 210, 0.16)',
  cone: 'rgba(255, 209, 102, 0.55)',
  gold: '#ffd166',
  exit: '#3ddc84',
  block: '#e0566b',
  dim: '#7c869a',
};

export interface MenuOptions {
  levels: Level[];
  onSelect: (index: number) => void;
}

export class Menu {
  private root: HTMLElement;
  private bg: HTMLCanvasElement;
  private cards: HTMLButtonElement[] = [];
  private continueButton: HTMLButtonElement;
  private total: HTMLElement;
  private levels: Level[];
  private onSelect: (index: number) => void;
  private best: number[] = [];
  private raf = 0;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  constructor(root: HTMLElement, opts: MenuOptions) {
    this.root = root;
    this.levels = opts.levels;
    this.onSelect = opts.onSelect;
    this.bg = root.querySelector('#menu-bg') as HTMLCanvasElement;
    this.continueButton = root.querySelector('#menu-continue') as HTMLButtonElement;
    this.total = root.querySelector('#menu-total') as HTMLElement;
    const grid = root.querySelector('#menu-levels') as HTMLElement;

    this.levels.forEach((level, i) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'level-card';
      card.id = `level-${i + 1}`;
      card.innerHTML = `
        <canvas class="level-thumb" width="320" height="200" aria-hidden="true"></canvas>
        <span class="level-meta">
          <span class="level-number">${String(i + 1).padStart(2, '0')}</span>
          <span class="level-stars" aria-label="no stars yet"></span>
        </span>
        <span class="level-name"></span>
        <span class="level-concept"></span>`;
      card.querySelector('.level-name')!.textContent = level.name;
      card.querySelector('.level-concept')!.textContent = level.concept;
      card.addEventListener('click', () => this.onSelect(i));
      card.addEventListener('keydown', (e) => this.onCardKey(e, i));
      grid.appendChild(card);
      this.cards.push(card);
      drawThumbnail(card.querySelector('canvas')!, level);
    });

    this.continueButton.addEventListener('click', () => this.onSelect(this.nextLevel()));
    showBuildStamp(root.querySelector('#build-stamp') as HTMLElement);
    window.addEventListener('resize', () => this.resizeBg());
  }

  /** Start a level, as if its card were clicked. */
  select(index: number): void {
    this.onSelect(index);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(best: number[], focusIndex?: number): void {
    this.best = best;
    this.root.hidden = false;
    this.refresh();
    this.resizeBg();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame((t) => this.animate(t));
    const target = focusIndex === undefined ? this.continueButton : this.cards[focusIndex];
    target.focus({ preventScroll: true });
  }

  hide(): void {
    this.root.hidden = true;
    cancelAnimationFrame(this.raf);
  }

  /** First level without a win, or the last level when all are done. */
  private nextLevel(): number {
    const i = this.best.findIndex((s) => s === 0);
    return i === -1 ? this.levels.length - 1 : i;
  }

  private refresh(): void {
    this.cards.forEach((card, i) => {
      const stars = this.best[i] ?? 0;
      const el = card.querySelector('.level-stars') as HTMLElement;
      el.innerHTML = [0, 1, 2].map((k) => `<span class="${k < stars ? 'on' : ''}">★</span>`).join('');
      el.setAttribute('aria-label', stars ? `${stars} of 3 stars` : 'not cleared yet');
      card.classList.toggle('cleared', stars > 0);
    });
    const next = this.nextLevel();
    const allDone = this.best.every((s) => s > 0);
    this.continueButton.textContent = allDone ? 'Play again' : next === 0 && this.best[0] === 0 ? 'Start' : 'Continue';
    this.continueButton.dataset.level = `${next + 1}. ${this.levels[next].name}`;
    const sum = this.best.reduce((a, b) => a + b, 0);
    this.total.textContent = `${sum} / ${this.levels.length * 3} ★`;
  }

  private onCardKey(e: KeyboardEvent, i: number): void {
    const cols = Math.max(1, Math.round((this.root.querySelector('#menu-levels') as HTMLElement).clientWidth / this.cards[0].clientWidth));
    const move: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols };
    if (e.key in move) {
      e.preventDefault();
      e.stopPropagation();
      const j = Math.max(0, Math.min(this.cards.length - 1, i + move[e.key]));
      this.cards[j].focus();
    }
  }

  private resizeBg(): void {
    const dpr = window.devicePixelRatio || 1;
    this.bg.width = Math.round(this.bg.clientWidth * dpr);
    this.bg.height = Math.round(this.bg.clientHeight * dpr);
    this.bg.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.reducedMotion.matches) drawBackground(this.bg, 0);
  }

  private animate(now: number): void {
    if (!this.visible) return;
    drawBackground(this.bg, this.reducedMotion.matches ? 0 : now / 1000);
    if (!this.reducedMotion.matches) this.raf = requestAnimationFrame((t) => this.animate(t));
  }
}

/** Show when this build was made (the deploy time on GitHub Pages), in the viewer's time zone. */
function showBuildStamp(el: HTMLElement): void {
  const built = new Date(__BUILD_TIME__);
  const when = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(built);
  el.textContent = `${__BUILD_DEPLOYED__ ? 'Deployed' : 'Built'} `;
  const time = document.createElement('time');
  time.dateTime = __BUILD_TIME__;
  time.textContent = when;
  el.appendChild(time);
  if (__BUILD_COMMIT__) el.append(` · commit ${__BUILD_COMMIT__}`);
}

/**
 * The background is a Minkowski diagram under a slowly oscillating Lorentz boost.
 * Events slide along hyperbolae of constant interval, the light cone stays put,
 * and photons recolour with the boost rapidity, as they do in the game.
 */
function drawBackground(canvas: HTMLCanvasElement, time: number): void {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const unit = Math.max(28, Math.min(w, h) / 14);
  const ox = w * 0.5;
  const oy = h * 0.55;
  const X = (x: number) => ox + x * unit;
  const Y = (t: number) => oy - t * unit;
  const phi = 0.9 * Math.sin(time * 0.25);
  const ch = Math.cosh(phi);
  const sh = Math.sinh(phi);
  const reach = Math.hypot(w, h) / unit;

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, w, h);

  // Boosted lattice of events: each dot moves along its own hyperbola.
  ctx.fillStyle = C.grid;
  const n = Math.ceil(reach);
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const x = i * ch + j * sh;
      const t = j * ch + i * sh;
      const px = X(x);
      const py = Y(t);
      if (px < -4 || px > w + 4 || py < -4 || py > h + 4) continue;
      ctx.fillRect(px - 1, py - 1, 2, 2);
    }
  }

  // Hyperbolae of constant interval in all four wedges.
  ctx.strokeStyle = C.hyperbola;
  ctx.lineWidth = 1;
  for (let rho = 1; rho <= 8; rho++) {
    for (const [sx, st, timelike] of [
      [1, 1, false],
      [-1, 1, false],
      [1, 1, true],
      [1, -1, true],
    ] as const) {
      ctx.beginPath();
      for (let eta = -3; eta <= 3.001; eta += 0.05) {
        const a = rho * Math.cosh(eta);
        const b = rho * Math.sinh(eta);
        const x = timelike ? b : sx * a;
        const t = timelike ? st * a : b;
        if (eta === -3) ctx.moveTo(X(x), Y(t));
        else ctx.lineTo(X(x), Y(t));
      }
      ctx.stroke();
    }
  }

  // Accelerated observers: points riding the right and left hyperbolae, with proper-time ticks.
  for (let rho = 2; rho <= 6; rho += 2) {
    for (const side of [1, -1]) {
      const eta = phi + 0.4 * side;
      ctx.fillStyle = C.gold;
      ctx.globalAlpha = 0.35 + 0.1 * rho;
      ctx.beginPath();
      ctx.arc(X(side * rho * Math.cosh(eta)), Y(rho * Math.sinh(eta)), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // Photons: 45° lines whose colour follows the boost (left-movers blueshift as phi grows).
  const period = 2.4;
  const drift = (time * 1.2) % period;
  ctx.lineWidth = 1.5;
  for (let k = -10; k <= 10; k++) {
    for (const dir of [1, -1] as const) {
      const c = k * period + drift * dir;
      const lnD = -dir * phi;
      const col = photonColour(lnD * 1.6);
      ctx.strokeStyle = col.css;
      ctx.globalAlpha = 0.16;
      ctx.beginPath();
      // Line x = dir * t + c, drawn across the screen.
      ctx.moveTo(X(c - dir * reach), Y(-reach));
      ctx.lineTo(X(c + dir * reach), Y(reach));
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // The light cone through the origin, which no boost can tilt.
  ctx.strokeStyle = C.cone;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(X(-reach), Y(-reach));
  ctx.lineTo(X(reach), Y(reach));
  ctx.moveTo(X(reach), Y(-reach));
  ctx.lineTo(X(-reach), Y(reach));
  ctx.stroke();
  ctx.setLineDash([]);

  // Vignette so the menu text reads.
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(11, 14, 20, 0.55)');
  g.addColorStop(1, 'rgba(11, 14, 20, 0.9)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** Draw a level's spacetime layout at equal x and t scale, so light still runs at 45°. */
function drawThumbnail(canvas: HTMLCanvasElement, level: Level): void {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  const { xMin, xMax, tMax } = level.bounds;
  const pad = 10;
  const scale = (w - pad * 2) / (xMax - xMin);
  const t0 = level.start.t - 0.5;
  const tTop = Math.min(tMax, t0 + (h - pad) / scale);
  const X = (x: number) => pad + (x - xMin) * scale;
  const Y = (t: number) => h - (t - t0) * scale;

  ctx.fillStyle = '#0e121a';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(X(xMin), Y(tTop), (xMax - xMin) * scale, (tTop - t0) * scale);
  ctx.clip();

  ctx.strokeStyle = 'rgba(120, 140, 180, 0.1)';
  ctx.lineWidth = 1;
  for (let x = Math.ceil(xMin); x <= xMax; x++) {
    ctx.beginPath();
    ctx.moveTo(X(x), 0);
    ctx.lineTo(X(x), h);
    ctx.stroke();
  }
  for (let t = Math.ceil(t0); t <= tTop; t++) {
    ctx.beginPath();
    ctx.moveTo(0, Y(t));
    ctx.lineTo(w, Y(t));
    ctx.stroke();
  }

  for (const e of level.emitters) {
    ctx.strokeStyle = 'rgba(180, 160, 255, 0.35)';
    for (let t = e.tStart; t <= tTop; t += e.period) {
      ctx.beginPath();
      ctx.moveTo(X(e.x), Y(t));
      ctx.lineTo(X(e.x + e.direction * (tTop - t + 1)), Y(tTop + 1));
      ctx.stroke();
    }
  }

  const rect = (r: Level['exit'], color: string) => {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.25;
    ctx.fillRect(X(r.x0), Y(r.t1), (r.x1 - r.x0) * scale, (r.t1 - r.t0) * scale);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(X(r.x0), Y(r.t1), (r.x1 - r.x0) * scale, (r.t1 - r.t0) * scale);
  };
  rect(level.exit, C.exit);
  for (const b of level.blocks) rect(b, C.block);

  // Future light cone from the start event.
  const sx = X(level.start.x);
  const sy = Y(level.start.t);
  const d = (tTop - level.start.t) * scale;
  ctx.fillStyle = 'rgba(255, 209, 102, 0.06)';
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx - d, sy - d);
  ctx.lineTo(sx + d, sy - d);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 209, 102, 0.45)';
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(sx - d, sy - d);
  ctx.lineTo(sx, sy);
  ctx.lineTo(sx + d, sy - d);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = C.gold;
  ctx.beginPath();
  ctx.arc(sx, sy, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
