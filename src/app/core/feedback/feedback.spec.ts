import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProfileService } from '../profile/profile.service';
import { MotionService } from './motion.service';
import { SoundService } from './sound.service';
import { MAX_GAIN, SOUNDS } from './sounds';

describe('feedback services', () => {
  const preferences = signal<Record<string, unknown> | null>(null);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: ProfileService, useValue: { preferences } }],
    });
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-motion');
    document.querySelectorAll('.confetti').forEach((el) => el.remove());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('SoundService', () => {
    /** Fake Web Audio: records the peak gain of every tone played. */
    function withAudio() {
      const peaks: number[] = [];
      vi.stubGlobal(
        'AudioContext',
        class {
          state = 'running';
          currentTime = 0;
          destination = {};
          resume = vi.fn();
          createOscillator() {
            return {
              type: 'sine',
              frequency: { setValueAtTime: vi.fn() },
              connect: (node: unknown) => node,
              start: vi.fn(),
              stop: vi.fn(),
            };
          }
          createGain() {
            let ramps = 0;
            return {
              gain: {
                setValueAtTime: vi.fn(),
                exponentialRampToValueAtTime: (value: number) => {
                  if (ramps++ === 0) peaks.push(value);
                },
              },
              connect: (node: unknown) => node,
            };
          }
        },
      );
      return peaks;
    }

    it('plays at the preferred volume and stays silent when sounds are off', () => {
      const peaks = withAudio();
      preferences.set({ sounds_enabled: true, sound_volume: 100 });
      const service = TestBed.inject(SoundService);
      service.play('success');
      expect(peaks).toHaveLength(SOUNDS.success.length);
      expect(peaks[0]).toBeCloseTo(MAX_GAIN);

      preferences.set({ sounds_enabled: false, sound_volume: 100 });
      service.play('error');
      expect(peaks).toHaveLength(SOUNDS.success.length);
    });

    it('skips the same effect repeated in a burst but previews on demand', () => {
      const peaks = withAudio();
      preferences.set({ sounds_enabled: true, sound_volume: 60 });
      const service = TestBed.inject(SoundService);
      service.play('tick');
      service.play('tick');
      expect(peaks).toHaveLength(1);
      service.preview('tick', 30);
      expect(peaks).toHaveLength(2);
    });

    it('does nothing without Web Audio', () => {
      vi.stubGlobal('AudioContext', undefined);
      preferences.set({ sounds_enabled: true, sound_volume: 60 });
      expect(() => TestBed.inject(SoundService).play('notify')).not.toThrow();
    });
  });

  describe('MotionService', () => {
    it('marks the document when animations are turned off', () => {
      preferences.set({ animations_enabled: false });
      const motion = TestBed.inject(MotionService);
      TestBed.tick();
      expect(document.documentElement.getAttribute('data-motion')).toBe('off');
      expect(motion.enabled).toBe(false);
      motion.celebrate();
      expect(document.querySelector('.confetti')).toBeNull();

      preferences.set({ animations_enabled: true });
      TestBed.tick();
      expect(document.documentElement.hasAttribute('data-motion')).toBe(false);
    });

    it('bursts confetti at the given point and cleans it up', () => {
      vi.useFakeTimers();
      preferences.set({ animations_enabled: true });
      const motion = TestBed.inject(MotionService);
      TestBed.tick();
      motion.celebrate({ x: 100, y: 50 });
      const pieces = document.querySelectorAll<HTMLElement>('.confetti span');
      expect(pieces.length).toBeGreaterThan(10);
      expect(pieces[0].style.left).toBe('100px');
      vi.advanceTimersByTime(1300);
      expect(document.querySelector('.confetti')).toBeNull();
      vi.useRealTimers();
    });
  });
});
