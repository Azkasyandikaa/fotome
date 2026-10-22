/**
 * Party mode easter egg — press "f" three times quickly.
 * Rainbow background wash + confetti, everything a photobooth needs.
 */
import { burstConfetti, stopConfetti } from './Confetti';

const KEY = 'photobooth.party';
let armed = 0;
let lastPress = 0;
let bound = false;

export function isPartyOn(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function setParty(on: boolean): void {
  document.body.classList.toggle('is-party', on);
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (on) burstConfetti(220);
  else stopConfetti();
}

export function initPartyMode(): void {
  if (bound) return;
  bound = true;

  if (isPartyOn()) setParty(true);

  document.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key.toLowerCase() !== 'f') {
      armed = 0;
      return;
    }
    const now = Date.now();
    if (now - lastPress > 1500) armed = 0;
    lastPress = now;
    armed += 1;
    if (armed >= 3) {
      armed = 0;
      setParty(!isPartyOn());
    }
  });
}
