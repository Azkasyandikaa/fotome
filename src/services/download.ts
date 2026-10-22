/** Turn the final canvas into an image file and hand it to the browser downloader. */

export type ExportFormat = 'png' | 'jpeg';

export const FORMAT_MIME: Record<ExportFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
};

export const FORMAT_EXT: Record<ExportFormat, string> = {
  png: 'png',
  jpeg: 'jpg',
};

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality = 0.92,
  mime: string = FORMAT_MIME.jpeg,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image'))),
      mime,
      quality,
    );
  });
}

export function makeFilename(ext: string = FORMAT_EXT.jpeg): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes(),
  )}${pad(d.getSeconds())}`;
  return `fotostrip-${stamp}.${ext}`;
}

/** Trigger a browser download of the canvas in the requested format. */
export async function downloadCanvasAs(
  canvas: HTMLCanvasElement,
  filename: string,
  format: ExportFormat,
  quality = 0.92,
): Promise<void> {
  const blob = await canvasToBlob(canvas, quality, FORMAT_MIME[format]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Back-compat helper: JPEG download with an auto-generated name. */
export async function downloadCanvas(canvas: HTMLCanvasElement): Promise<string> {
  const name = makeFilename();
  await downloadCanvasAs(canvas, name, 'jpeg');
  return name;
}
