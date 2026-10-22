/**
 * Lightweight canvas confetti burst — no dependencies.
 * Usage: burstConfetti() fires one celebratory burst from the bottom center.
 */

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
  shape: 0 | 1 | 2; // rect / circle / squiggle(ball)
}

const COLORS = ['#6d5efc', '#efedff', '#ff5d8f', '#16a34a', '#d97706', '#2563eb'];

let canvas: HTMLCanvasElement | null = null;
let pieces: Piece[] = [];
let raf = 0;

function spawn(count: number, originX: number, originY: number, spread: number, upSpeed: number): void {
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * spread;
    const speed = upSpeed * (0.5 + Math.random() * 0.7);
    pieces.push({
      x: originX + (Math.random() - 0.5) * 80,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 6 + Math.random() * 8,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.3,
      shape: Math.floor(Math.random() * 3) as 0 | 1 | 2,
    });
  }
}

function step(): void {
  const cv = canvas;
  if (!cv) return;
  const ctx = cv.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, cv.width, cv.height);
  const g = 0.16;
  const drag = 0.992;

  pieces = pieces.filter((p) => p.y < cv.height + 40);
  for (const p of pieces) {
    p.vy += g;
    p.vx *= drag;
    p.vy *= drag;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    if (p.shape === 0) {
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    } else if (p.shape === 1) {
      ctx.beginPath();
      ctx.arc(0, 0, p.size / 2.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (pieces.length > 0) {
    raf = requestAnimationFrame(step);
  } else {
    ctx.clearRect(0, 0, cv.width, cv.height);
    raf = 0;
  }
}

/** Fire a celebratory burst from the bottom-center of the viewport. */
export function burstConfetti(count = 140): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);

  spawn(Math.floor(count / 2), window.innerWidth * 0.3, window.innerHeight + 10, 1.6, 13 + Math.random() * 3);
  spawn(count - Math.floor(count / 2), window.innerWidth * 0.7, window.innerHeight + 10, 1.6, 13 + Math.random() * 3);
  if (!raf) raf = requestAnimationFrame(step);
}

/** Stop and remove the confetti canvas (used by party-mode exit). */
export function stopConfetti(): void {
  pieces = [];
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  canvas?.remove();
  canvas = null;
}
