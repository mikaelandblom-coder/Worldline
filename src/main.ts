// Boot and game loop: fixed physics steps, one render per animation frame.

import { createRun, tick, type Run } from './game';
import { Input } from './input';
import { LEVELS } from './levels';
import { Menu } from './menu';
import { DT } from './physics';
import { render, type Screen } from './render';

/** Coordinate time that passes per real second. */
const TIME_SCALE = 1.5;
const MAX_STEPS_PER_FRAME = 10;
const STORAGE_KEY = 'worldline.bestStars';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const input = new Input(canvas);
const menuButton = document.getElementById('menu-button') as HTMLButtonElement;

function loadBest(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (Array.isArray(v)) return LEVELS.map((_, i) => (typeof v[i] === 'number' ? v[i] : 0));
  } catch {
    // Storage unavailable; progress just won't persist.
  }
  return LEVELS.map(() => 0);
}

function saveBest(best: number[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(best));
  } catch {
    // Ignore.
  }
}

const best = loadBest();
let levelIndex = 0;
let run: Run = createRun(LEVELS[levelIndex]);
let screen: Screen = 'intro';
let accumulator = 0;

const menu = new Menu(document.getElementById('menu')!, {
  levels: LEVELS,
  onSelect: (index) => {
    load(index);
    // Start right away: choosing a level is the intent to play it.
    screen = 'playing';
  },
});

function load(index: number): void {
  levelIndex = Math.max(0, Math.min(LEVELS.length - 1, index));
  run = createRun(LEVELS[levelIndex]);
  screen = 'intro';
  accumulator = 0;
  menu.hide();
  menuButton.hidden = false;
  played = true;
  canvas.focus();
}

let played = false;

function openMenu(): void {
  menuButton.hidden = true;
  // Before any level is played, focus the Start button; afterwards, the last level's card.
  menu.show(best, played ? levelIndex : undefined);
}

menuButton.addEventListener('click', openMenu);

function finish(): void {
  screen = 'ended';
  if (run.outcome.kind === 'won' && run.outcome.stars > best[levelIndex]) {
    best[levelIndex] = run.outcome.stars;
    saveBest(best);
  }
}

function handleActions(): void {
  const actions = input.takeActions();
  if (menu.visible) {
    // The menu handles its own keys; only digit shortcuts pass through.
    for (const a of actions) if (typeof a === 'object' && a.level < LEVELS.length) menu.select(a.level);
    return;
  }
  for (const a of actions) {
    if (a === 'menu') {
      openMenu();
      return;
    }
    if (typeof a === 'object') {
      if (a.level < LEVELS.length) load(a.level);
    } else if (a === 'restart') load(levelIndex);
    else if (a === 'pause') {
      if (screen === 'playing') screen = 'paused';
      else if (screen === 'paused' || screen === 'intro') screen = 'playing';
    } else if (a === 'next') {
      if (screen === 'ended' && run.outcome.kind === 'won' && levelIndex < LEVELS.length - 1) load(levelIndex + 1);
      else if (screen === 'intro') screen = 'playing';
    } else if (a === 'start') {
      if (screen === 'intro') screen = 'playing';
      else if (screen === 'ended' && matchMedia('(pointer: coarse)').matches) {
        // Touch has no keys: a tap continues to the next level or retries.
        load(run.outcome.kind === 'won' && levelIndex < LEVELS.length - 1 ? levelIndex + 1 : levelIndex);
      }
    }
  }
}

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
function frame(now: number): void {
  const elapsed = Math.min(0.25, (now - last) / 1000);
  last = now;
  handleActions();
  if (menu.visible) {
    requestAnimationFrame(frame);
    return;
  }
  if (screen === 'playing') {
    accumulator += elapsed * TIME_SCALE;
    let steps = 0;
    while (accumulator >= DT && steps < MAX_STEPS_PER_FRAME) {
      tick(run, input.thrust());
      accumulator -= DT;
      steps++;
      if (run.outcome.kind !== 'playing') {
        finish();
        break;
      }
    }
  }
  render(ctx, run, { screen, levelIndex, levelCount: LEVELS.length, bestStars: best[levelIndex] });
  requestAnimationFrame(frame);
}
openMenu();
requestAnimationFrame(frame);
