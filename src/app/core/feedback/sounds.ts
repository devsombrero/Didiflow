/** Sound effects, synthesized with Web Audio (no audio files are shipped). */
export type SoundName = 'success' | 'complete' | 'notify' | 'error' | 'tick' | 'chime';

export interface Tone {
  /** Frequency in Hz. */
  freq: number;
  /** Offset from the start of the sound, in seconds. */
  at: number;
  /** Length in seconds (decay included). */
  length: number;
  wave?: OscillatorType;
  /** Relative loudness, 0–1. */
  level?: number;
}

export const SOUND_LABELS: Record<SoundName, string> = {
  success: 'Sucesso',
  complete: 'Tarefa concluída',
  notify: 'Notificação',
  error: 'Erro',
  tick: 'Clique',
  chime: 'Fim de foco',
};

export const SOUNDS: Record<SoundName, readonly Tone[]> = {
  success: [
    { freq: 659.25, at: 0, length: 0.14 },
    { freq: 880, at: 0.08, length: 0.22 },
  ],
  complete: [
    { freq: 523.25, at: 0, length: 0.16 },
    { freq: 659.25, at: 0.09, length: 0.16 },
    { freq: 783.99, at: 0.18, length: 0.18 },
    { freq: 1046.5, at: 0.28, length: 0.42, level: 0.8 },
  ],
  notify: [
    { freq: 987.77, at: 0, length: 0.3 },
    { freq: 1318.51, at: 0.13, length: 0.5, level: 0.7 },
  ],
  error: [
    { freq: 246.94, at: 0, length: 0.18, wave: 'triangle' },
    { freq: 196, at: 0.15, length: 0.3, wave: 'triangle' },
  ],
  tick: [{ freq: 1500, at: 0, length: 0.05, wave: 'triangle', level: 0.4 }],
  chime: [
    { freq: 783.99, at: 0, length: 0.6 },
    { freq: 987.77, at: 0.2, length: 0.6 },
    { freq: 1174.66, at: 0.4, length: 0.9, level: 0.8 },
  ],
};

/** Loudest output gain (at volume 100), kept low so effects stay subtle. */
export const MAX_GAIN = 0.35;

export function gainFor(volume: number): number {
  return (Math.min(100, Math.max(0, volume)) / 100) * MAX_GAIN;
}

/** Schedules the tones on the context: short attack, exponential decay. */
export function playTones(context: AudioContext, tones: readonly Tone[], gain: number): void {
  const now = context.currentTime;
  for (const tone of tones) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const start = now + tone.at;
    const peak = Math.max(0.0001, gain * (tone.level ?? 1));
    oscillator.type = tone.wave ?? 'sine';
    oscillator.frequency.setValueAtTime(tone.freq, start);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + tone.length);
    oscillator.connect(envelope).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + tone.length + 0.02);
  }
}
