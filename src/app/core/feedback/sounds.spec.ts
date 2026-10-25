import { gainFor, MAX_GAIN, playTones, SOUNDS } from './sounds';

function fakeContext() {
  const oscillators: { type: string; freq: number; start: number; stop: number }[] = [];
  const param = () => ({ setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const context = {
    currentTime: 10,
    destination: {},
    createGain: () => {
      const node = { gain: param(), connect: vi.fn((target: unknown) => target) };
      return node;
    },
    createOscillator: () => {
      const entry = { type: 'sine', freq: 0, start: 0, stop: 0 };
      oscillators.push(entry);
      return {
        set type(value: string) {
          entry.type = value;
        },
        frequency: {
          setValueAtTime: (value: number) => {
            entry.freq = value;
          },
        },
        connect: (node: { connect: (t: unknown) => unknown }) => node,
        start: (at: number) => {
          entry.start = at;
        },
        stop: (at: number) => {
          entry.stop = at;
        },
      };
    },
  };
  return { context: context as unknown as AudioContext, oscillators };
}

describe('sounds', () => {
  it('maps volume 0–100 to a gentle gain', () => {
    expect(gainFor(0)).toBe(0);
    expect(gainFor(100)).toBe(MAX_GAIN);
    expect(gainFor(250)).toBe(MAX_GAIN);
    expect(gainFor(50)).toBeCloseTo(MAX_GAIN / 2);
  });

  it('schedules one oscillator per tone at its offset', () => {
    const { context, oscillators } = fakeContext();
    playTones(context, SOUNDS.complete, 0.2);
    expect(oscillators).toHaveLength(SOUNDS.complete.length);
    expect(oscillators[0].start).toBe(10);
    expect(oscillators[3].start).toBeCloseTo(10.28);
    expect(oscillators[3].freq).toBe(1046.5);
    expect(oscillators.every((o) => o.stop > o.start)).toBe(true);
  });

  it('defines every sound with audible, short tones', () => {
    for (const tones of Object.values(SOUNDS)) {
      expect(tones.length).toBeGreaterThan(0);
      for (const tone of tones) {
        expect(tone.freq).toBeGreaterThan(100);
        expect(tone.length).toBeLessThanOrEqual(1);
      }
    }
  });
});
