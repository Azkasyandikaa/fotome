/**
 * Tiny WebAudio SFX — no audio files needed.
 * Countdown beeps + shutter click + success chime. Volume is kept gentle so it
 * sits under the background music. AudioContext resumes on first gesture.
 */

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** One short sine blip. */
function blip(freq: number, dur: number, gain: number, type: OscillatorType = 'sine', when = 0): void {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + when;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** Countdown tick (3..2..1) — softer on the last beat pair. */
export function sfxTick(): void {
  blip(880, 0.09, 0.06, 'triangle');
}

/** Shutter: quick noise-ish double click. */
export function sfxShutter(): void {
  blip(180, 0.05, 0.12, 'square');
  blip(90, 0.07, 0.1, 'square', 0.06);
}

/** Success chime after download/share. */
export function sfxSuccess(): void {
  blip(660, 0.12, 0.07, 'sine');
  blip(880, 0.12, 0.07, 'sine', 0.1);
  blip(1320, 0.2, 0.06, 'sine', 0.2);
}
