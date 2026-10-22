/**
 * Share helpers — Web Share API (with file) when available, otherwise
 * clipboard copy + WhatsApp text share as graceful fallbacks.
 */
import { canvasToBlob } from './download';

export async function canShareFiles(): Promise<boolean> {
  try {
    const blob = await canvasToBlob(document.createElement('canvas'), 0.9);
    const file = new File([blob], 'probe.jpg', { type: 'image/jpeg' });
    return typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] }) === true;
  } catch {
    return false;
  }
}

/** Native share sheet with the image attached. Returns true if shared. */
export async function shareCanvas(canvas: HTMLCanvasElement, title: string, text: string): Promise<boolean> {
  try {
    const blob = await canvasToBlob(canvas, 0.92);
    const file = new File([blob], makeShareName(), { type: 'image/jpeg' });
    if (typeof navigator.share !== 'function' || navigator.canShare?.({ files: [file] }) !== true) {
      return false;
    }
    await navigator.share({ files: [file], title, text });
    return true;
  } catch (err) {
    // AbortError = user closed the sheet — not a failure.
    if (err instanceof DOMException && err.name === 'AbortError') return true;
    return false;
  }
}

/** Copy the image to the clipboard (Chrome/Edge/Safari). */
export async function copyCanvasToClipboard(canvas: HTMLCanvasElement): Promise<boolean> {
  try {
    const blob = await canvasToBlob(canvas, 0.92);
    const item = new ClipboardItem({ 'image/jpeg': blob });
    await navigator.clipboard.write([item]);
    return true;
  } catch {
    return false;
  }
}

/** Open WhatsApp with a share text (image cannot be attached — user pastes it). */
export function shareViaWhatsApp(text: string): void {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function makeShareName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `photobooth-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.jpg`;
}
