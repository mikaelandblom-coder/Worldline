// Keyboard and touch input. Thrust is read every step; other keys fire actions.

export type Action = 'restart' | 'pause' | 'next' | 'start' | 'menu' | { level: number };

export class Input {
  private left = false;
  private right = false;
  private touches = new Map<number, -1 | 1>();
  private actions: Action[] = [];

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => {
      this.left = this.right = false;
      this.touches.clear();
    });
    target.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') {
        // Clicking gives the page keyboard focus (needed when embedded in a frame).
        window.focus();
        this.actions.push('start');
        return;
      }
      e.preventDefault();
      const side = e.clientX < target.clientWidth / 2 ? -1 : 1;
      this.touches.set(e.pointerId, side);
      this.actions.push('start');
    });
    const release = (e: PointerEvent) => this.touches.delete(e.pointerId);
    target.addEventListener('pointerup', release);
    target.addEventListener('pointercancel', release);
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    // Let focused buttons (menu cards, the Levels button) handle their own activation keys.
    if (e.target instanceof HTMLButtonElement && (e.code === 'Enter' || e.code === 'Space')) return;
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.left = down;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.right = down;
        break;
      case 'KeyR':
        if (down && !e.repeat) this.actions.push('restart');
        break;
      case 'Space':
        if (down && !e.repeat) this.actions.push('pause');
        break;
      case 'Escape':
      case 'KeyM':
        if (down && !e.repeat) this.actions.push('menu');
        break;
      case 'KeyN':
      case 'Enter':
        if (down && !e.repeat) this.actions.push('next');
        break;
      default:
        if (down && /^Digit[1-9]$/.test(e.code)) this.actions.push({ level: Number(e.code.slice(5)) - 1 });
        return;
    }
    if (down && (e.code.startsWith('Arrow') || e.code === 'KeyA' || e.code === 'KeyD')) this.actions.push('start');
    e.preventDefault();
  }

  /** -1, 0 or +1. */
  thrust(): number {
    let l = this.left;
    let r = this.right;
    for (const side of this.touches.values()) {
      if (side < 0) l = true;
      else r = true;
    }
    return (r ? 1 : 0) - (l ? 1 : 0);
  }

  takeActions(): Action[] {
    const a = this.actions;
    this.actions = [];
    return a;
  }
}
