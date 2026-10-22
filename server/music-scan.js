/**
 * Music drop-in scanner.
 * Scans public/music/ for user-supplied background tracks. Drop files, refresh.
 *
 * Tracks:    public/music/<file>.mp3 (or m4a/ogg/wav/...)
 * Playlist:  public/music/playlist.json (optional)
 *            { "autoplay": true, "order": ["a.mp3", "b.mp3"], "titles": { "a.mp3": "Judul" } }
 */
import fs from 'node:fs';
import path from 'node:path';

const AUDIO_RE = /\.(mp3|m4a|aac|ogg|oga|opus|wav|webm|flac)$/i;
const IGNORE = ['playlist.json', 'README.txt', 'node_modules'];

export function scanMusic(publicDir) {
  const root = path.join(publicDir, 'music');

  let config = null;
  try {
    config = JSON.parse(fs.readFileSync(path.join(root, 'playlist.json'), 'utf8'));
  } catch {
    /* no/invalid playlist.json -> defaults */
  }

  const files = [];
  try {
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
      if (!e.isFile() || e.name.startsWith('.') || IGNORE.includes(e.name)) continue;
      if (AUDIO_RE.test(e.name)) files.push(e.name);
    }
  } catch {
    /* folder missing -> empty */
  }

  // playlist.json "order" first, then remaining files alphabetically.
  const order = Array.isArray(config?.order) ? config.order : [];
  const seen = new Set();
  const sorted = [];
  for (const f of order) {
    if (files.includes(f) && !seen.has(f)) {
      sorted.push(f);
      seen.add(f);
    }
  }
  for (const f of files.sort((a, b) => a.localeCompare(b, 'id'))) {
    if (!seen.has(f)) sorted.push(f);
  }

  const titles = config?.titles && typeof config.titles === 'object' ? config.titles : {};

  return {
    autoplay: config?.autoplay !== false,
    tracks: sorted.map((f) => ({
      src: `/music/${encodeURIComponent(f)}`,
      file: f,
      title: typeof titles[f] === 'string' && titles[f].trim() ? titles[f] : f.replace(AUDIO_RE, '').replace(/[-_]+/g, ' '),
    })),
  };
}
