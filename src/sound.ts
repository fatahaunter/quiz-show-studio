import { loadPrefs } from './store/storage';

// Original synthesized tones (no audio files, nothing copyrighted). Sound is always optional.
let ctx: AudioContext | null = null;

export function unlockAudio() {
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.25) {
  if (!ctx) return;
  const p = loadPrefs();
  if (!p.sound) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t0 = ctx.currentTime + start;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain * p.volume, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

export const sfx = {
  reveal: () => [440, 587, 784].forEach((f, i) => tone(f, i * 0.07, 0.25, 'triangle')),
  tick: () => tone(660, 0, 0.08, 'square', 0.12),
  armed: () => tone(880, 0, 0.18, 'square', 0.15),
  buzz: () => {
    tone(330, 0, 0.35, 'sawtooth', 0.2);
    tone(660, 0, 0.35, 'square', 0.1);
  },
  correct: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.3, 'triangle')),
  wrong: () => {
    tone(220, 0, 0.3, 'sawtooth', 0.2);
    tone(165, 0.22, 0.45, 'sawtooth', 0.2);
  },
  dailyDouble: () => [392, 523, 659, 784, 988].forEach((f, i) => tone(f, i * 0.1, 0.35, 'square', 0.12)),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.14, 0.5, 'triangle')),
};
