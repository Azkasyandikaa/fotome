import type { Layer, PhotoTransform } from '../types';

/**
 * In-memory handoff between the editor, the capture page and #/download.
 *
 * Everything here lives in the tab only — no photo ever leaves the browser.
 * The composite canvas is produced by renderFinal() when the user taps
 * "Lanjut ke Unduh"; the download page renders exactly that canvas.
 */
export interface PendingExport {
  canvas: HTMLCanvasElement;
  templateId: string;
  templateName: string;
  /** Session the export belongs to — guards against stale results. */
  sessionId: string;
  createdAt: number;
}

let pending: PendingExport | null = null;
let draft: {
  sessionId: string;
  layers: Layer[];
  /** Transformasi foto (zoom/geser/putar di dalam lubang slot). */
  photos: (PhotoTransform | undefined)[];
} | null = null;

export function setPendingExport(value: PendingExport): void {
  pending = value;
}

export function getPendingExport(): PendingExport | null {
  return pending;
}

export function clearPendingExport(): void {
  pending = null;
}

/**
 * The editor's layers are kept when the user hops to #/download and back
 * via "Edit Ulang", so their stickers/text/pen strokes survive the round trip.
 * Transformasi foto ikut disimpan supaya ukuran hasil jepretan tidak balik
 * ke default saat user kembali mengedit.
 */
export function saveDraftLayers(
  sessionId: string,
  layers: Layer[],
  photos: (PhotoTransform | undefined)[] = [],
): void {
  draft = {
    sessionId,
    layers: layers.map((l) => ({ ...l })),
    photos: photos.map((p) => (p ? { ...p } : undefined)),
  };
}

export function loadDraftLayers(sessionId: string): Layer[] | null {
  if (!draft || draft.sessionId !== sessionId) return null;
  return draft.layers.map((l) => ({ ...l }));
}

export function loadDraftPhotos(sessionId: string): (PhotoTransform | undefined)[] | null {
  if (!draft || draft.sessionId !== sessionId) return null;
  return draft.photos.map((p) => (p ? { ...p } : undefined));
}

export function clearDraftLayers(): void {
  draft = null;
}

/** Full reset — used when a session ends (new strip / back to home). */
export function clearTransferState(): void {
  pending = null;
  draft = null;
}
