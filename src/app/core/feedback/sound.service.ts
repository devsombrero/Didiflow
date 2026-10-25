import { inject, Injectable, Injector } from '@angular/core';
import { ProfileService } from '../profile/profile.service';
import { gainFor, playTones, type SoundName, SOUNDS } from './sounds';

/** Same effect played again within this window is skipped (bursts of toasts). */
const REPEAT_WINDOW_MS = 120;

/** Plays interface sound effects according to the user's preferences. */
@Injectable({ providedIn: 'root' })
export class SoundService {
  // Resolved lazily: toasts (and so sounds) are used by components that do
  // not otherwise need the Supabase-backed profile, e.g. in unit tests.
  private readonly injector = inject(Injector);
  private context: AudioContext | null = null;
  private readonly lastPlayed = new Map<SoundName, number>();

  private preferences() {
    try {
      return this.injector.get(ProfileService).preferences();
    } catch {
      return null;
    }
  }

  get enabled(): boolean {
    return this.preferences()?.sounds_enabled ?? true;
  }

  /** Plays an effect unless sounds are off. */
  play(name: SoundName): void {
    if (!this.enabled) return;
    this.output(name, this.preferences()?.sound_volume ?? 60);
  }

  /** Plays an effect at the given volume, even when sounds are off (settings preview). */
  preview(name: SoundName, volume: number): void {
    this.output(name, volume, true);
  }

  private output(name: SoundName, volume: number, force = false): void {
    const now = Date.now();
    if (!force && now - (this.lastPlayed.get(name) ?? 0) < REPEAT_WINDOW_MS) return;
    this.lastPlayed.set(name, now);
    const context = this.audio();
    if (!context || volume <= 0) return;
    if (context.state === 'suspended') void context.resume();
    try {
      playTones(context, SOUNDS[name], gainFor(volume));
    } catch {
      // Audio output unavailable: feedback stays visual only.
    }
  }

  private audio(): AudioContext | null {
    if (this.context) return this.context;
    if (typeof AudioContext !== 'function') return null;
    this.context = new AudioContext();
    return this.context;
  }
}
