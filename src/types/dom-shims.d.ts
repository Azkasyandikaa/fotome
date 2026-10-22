/**
 * Ambient re-export so components can `import type { ImageBitmap } from './dom-shims'`.
 * The real type comes from the DOM lib.
 */
export type ImageBitmap = globalThis.ImageBitmap;
