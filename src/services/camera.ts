/** Thin wrapper around getUserMedia with clean start/stop and device switching. */

export interface CameraHandle {
  stream: MediaStream;
  track: MediaStreamTrack;
  deviceId: string | null;
  facing: 'user' | 'environment';
}

let current: CameraHandle | null = null;

export class CameraUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CameraUnavailableError';
  }
}

function friendlyError(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'NotAllowedError':
        return 'Camera permission is required to take photos. Allow access and try again.';
      case 'NotFoundError':
      case 'OverconstrainedError':
        return 'No camera was found on this device.';
      case 'NotReadableError':
        return 'The camera is busy — close other apps using it and retry.';
      case 'SecurityError':
        return 'Camera access is blocked. Open this page over HTTPS or localhost.';
      default:
        return 'Camera could not be started. Please try again.';
    }
  }
  return 'Camera could not be started. Please try again.';
}

export async function startCamera(facing: 'user' | 'environment' = 'user'): Promise<CameraHandle> {
  await stopCamera();
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraUnavailableError('This browser does not support camera access.');
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 1280 } },
      audio: false,
    });
    const track = stream.getVideoTracks()[0];
    if (!track) throw new CameraUnavailableError('No camera was found on this device.');
    // Ask for continuous auto-exposure where supported (some webcams start dark).
    try {
      await track.applyConstraints({
        advanced: [{ exposureMode: 'continuous' } as unknown as MediaTrackConstraintSet],
      });
    } catch {
      /* optional — device may not support it */
    }
    const settings = track.getSettings();
    current = { stream, track, deviceId: settings.deviceId ?? null, facing };
    return current;
  } catch (err) {
    throw new CameraUnavailableError(friendlyError(err));
  }
}

export async function stopCamera(): Promise<void> {
  current?.stream.getTracks().forEach((t) => t.stop());
  current = null;
}

export function hasCamera(): boolean {
  return current !== null;
}

/**
 * Grab the current video frame as an ImageBitmap (caller owns it).
 *
 * `targetAspect` (width/height) memotong frame ke rasio yang SAMA dengan
 * yang sedang ditampilkan preview (`object-fit: cover` di tengah) — jadi
 * hasil jepretan = yang terlihat di layar kamera, bukan bingkai penuh
 * sensor yang jauh lebih lebar. Tanpa argumen ini perilaku lama dipertahankan.
 */
export async function grabFrame(
  video: HTMLVideoElement,
  mirror: boolean,
  targetAspect?: number,
): Promise<ImageBitmap | null> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (vw === 0 || vh === 0) return null;

  // Center-crop ke rasio preview: buang sisi yang kelebihan.
  let sx = 0;
  let sy = 0;
  let sw = vw;
  let sh = vh;
  if (targetAspect && targetAspect > 0 && Number.isFinite(targetAspect)) {
    const current = vw / vh;
    if (current > targetAspect) {
      sw = Math.max(1, Math.round(vh * targetAspect));
      sx = Math.round((vw - sw) / 2);
    } else if (current < targetAspect) {
      sh = Math.max(1, Math.round(vw / targetAspect));
      sy = Math.round((vh - sh) / 2);
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  if (mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
  // createImageBitmap keeps the raw frame; filter is applied at render time.
  return createImageBitmap(canvas);
}
