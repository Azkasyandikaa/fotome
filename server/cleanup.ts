import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/tmp/photobooth';
const MAX_AGE_MS = 15 * 60 * 1000;

/** Delete /tmp/photobooth/<id> folders older than MAX_AGE_MS. */
export function cleanupOnce(): number {
  let removed = 0;
  try {
    for (const entry of fs.readdirSync(ROOT)) {
      // Folder galeri publik permanen — jangan ikut di-reap.
      if (entry === 'gallery') continue;
      const dir = path.join(ROOT, entry);
      try {
        const st = fs.statSync(dir);
        if (!st.isDirectory()) continue;
        if (Date.now() - st.mtimeMs > MAX_AGE_MS) {
          fs.rmSync(dir, { recursive: true, force: true });
          removed++;
        }
      } catch {
        /* entry vanished or unreadable — skip */
      }
    }
  } catch {
    /* root does not exist yet — nothing to clean */
  }
  return removed;
}

export function startCleanupLoop(): NodeJS.Timeout {
  const t = setInterval(() => {
    const n = cleanupOnce();
    if (n > 0) console.log(`[cleanup] removed ${n} stale session folder(s)`);
  }, 5 * 60 * 1000);
  t.unref();
  return t;
}
