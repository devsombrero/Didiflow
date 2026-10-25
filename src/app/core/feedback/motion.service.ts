import { DOCUMENT, effect, inject, Injectable } from '@angular/core';
import { ProfileService } from '../profile/profile.service';

const CONFETTI_COLORS = ['--series-1', '--series-2', '--series-3', '--mat-sys-primary'];
const CONFETTI_PIECES = 28;

/**
 * Interface motion. Animations follow the user preference and the OS
 * "reduce motion" setting: when either asks for less motion, the root gets
 * data-motion="off" and the CSS shortens every animation to an instant.
 */
@Injectable({ providedIn: 'root' })
export class MotionService {
  private readonly document = inject(DOCUMENT);
  private readonly preferences = inject(ProfileService).preferences;

  constructor() {
    effect(() => {
      const enabled = this.preferences()?.animations_enabled ?? true;
      const root = this.document.documentElement;
      if (enabled) root.removeAttribute('data-motion');
      else root.setAttribute('data-motion', 'off');
    });
  }

  /** True when animations should play right now. */
  get enabled(): boolean {
    const root = this.document.documentElement;
    if (root.getAttribute('data-motion') === 'off') return false;
    const view = this.document.defaultView;
    return !(
      typeof view?.matchMedia === 'function' &&
      view.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  /**
   * Small confetti burst (task completed). Pure DOM + CSS, removed after the
   * animation; nothing happens when motion is off.
   */
  celebrate(origin?: { x: number; y: number }): void {
    if (!this.enabled) return;
    const view = this.document.defaultView;
    if (!view) return;
    const x = origin?.x ?? view.innerWidth / 2;
    const y = origin?.y ?? view.innerHeight / 3;
    const layer = this.document.createElement('div');
    layer.className = 'confetti';
    layer.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < CONFETTI_PIECES; i++) {
      const piece = this.document.createElement('span');
      const angle = (Math.PI * 2 * i) / CONFETTI_PIECES + Math.random() * 0.4;
      const distance = 60 + Math.random() * 90;
      piece.style.left = `${x}px`;
      piece.style.top = `${y}px`;
      piece.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
      piece.style.setProperty('--dy', `${Math.sin(angle) * distance - 40}px`);
      piece.style.setProperty('--spin', `${Math.round(Math.random() * 720 - 360)}deg`);
      piece.style.background = `var(${CONFETTI_COLORS[i % CONFETTI_COLORS.length]})`;
      layer.appendChild(piece);
    }
    this.document.body.appendChild(layer);
    view.setTimeout(() => layer.remove(), 1200);
  }
}
