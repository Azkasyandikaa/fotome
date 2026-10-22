/**
 * Verifikasi gejala "frame ter-upload tapi tidak masuk pilihan frame".
 *
 * Skenario yang sama dengan pengguna nyata:
 *   1. Buka #/frames  → katalog frame di-fetch sekali (cache klien).
 *   2. Upload frame baru lewat POST /api/booth/templates (dev, tanpa login).
 *   3. Pindah halaman pakai hash saja (TANPA reload browser) → #/frames lagi.
 *   4. Frame baru HARUS sudah ada di daftar pilihan frame.
 *
 *   node scripts/verify-frame-upload.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9600 + Math.floor(Math.random() * 200);
const DEV_PORT = 5300 + Math.floor(Math.random() * 100);
const BASE = process.env.BASE_URL ?? `http://localhost:${DEV_PORT}`;
const NAME = 'Bugcheck Frame';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name, ok, extra = '') {
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
}

// ---------------------------------------------------------------------------
// 1. Dev server (vite) + Chrome headless
// ---------------------------------------------------------------------------
const vite = spawn('npx', ['vite', '--port', String(DEV_PORT), '--strictPort'], {
  stdio: 'ignore',
  shell: true,
});
let up = false;
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch(`${BASE}/`);
    if (res.ok) { up = true; break; }
  } catch { /* not yet */ }
  await sleep(500);
}
if (!up) { vite.kill(); throw new Error('vite dev server tidak pernah siap'); }
console.log(`vite ready at ${BASE}`);

const profile = path.join(os.tmpdir(), 'fotome-verify-profile');
rmSync(profile, { recursive: true, force: true });

const chrome = spawn(
  CHROME,
  [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--no-default-browser-check', '--hide-scrollbars',
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${PORT}`,
    '--window-size=1280,1000',
    `${BASE}/#/frames`,
  ],
  { stdio: 'ignore' },
);

async function devtoolsTargets() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && /localhost/.test(t.url));
      if (page) return page;
    } catch { /* devtools not up yet */ }
    await sleep(500);
  }
  throw new Error('Chrome DevTools endpoint tidak pernah siap');
}

const target = await devtoolsTargets();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

const pending = new Map();
let nextId = 0;
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  }
});

function send(method, params = {}) {
  const id = ++nextId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evalJs(expression) {
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
  }
  return res.result.value;
}

async function waitFor(expression, timeoutMs = 20000, label = expression) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evalJs(`!!(${expression})`)) return true;
    await sleep(250);
  }
  throw new Error(`Timeout: ${label}`);
}

const frameNames = () =>
  evalJs(`[...document.querySelectorAll('.template-card__name')].map((n) => n.textContent.trim())`);

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: `${BASE}/#/frames` });
  await sleep(1500);
  // Headless Chrome kadang tidak menjalankan rAF untuk tab tersembunyi —
  // boot screen dibuang manual (sama seperti e2e-smoke.mjs).
  const nudge = "(document.getElementById('app').hidden=false,document.getElementById('boot')?.remove(),true)";
  await evalJs(nudge);

  // --- 1. Halaman pilih frame termuat & katalog sudah di-fetch (cache) ----
  await waitFor("document.querySelectorAll('.template-card').length > 0", 45000, 'kartu frame awal');
  const before = await frameNames();
  console.log(`      ${before.length} frame sebelum upload`);

  // --- 2. Upload frame baru (dev middleware: tanpa login) -----------------
  const uploaded = await evalJs(`(async () => {
    const c = document.createElement('canvas'); c.width = 8; c.height = 8;
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const res = await fetch('/api/booth/templates?name=${encodeURIComponent(NAME)}&slots=3', {
      method: 'POST', headers: { 'Content-Type': 'image/png' }, body: bytes,
    });
    return { status: res.status, body: await res.json() };
  })()`);
  check('upload frame baru (POST /api/booth/templates) sukses', uploaded.status === 201, `HTTP ${uploaded.status}`);
  const newId = uploaded.body?.id ?? '';
  check('server mengembalikan id frame baru', !!newId, newId || '(kosong)');

  // Server-side: manifest segar memang sudah memuat frame baru.
  const manifest = await (await fetch(`${BASE}/api/booth`)).json();
  check(
    'manifest /api/booth (scan segar) memuat frame baru',
    manifest.templates.some((t) => t.id === newId),
    newId,
  );

  // --- 3. Pindah halaman pakai hash saja (TANPA reload browser) -----------
  await evalJs("location.hash = '#/'");
  await sleep(800);
  await evalJs(nudge);
  await evalJs("location.hash = '#/frames'");
  await sleep(800);
  await evalJs(nudge);
  await waitFor("document.querySelectorAll('.template-card').length > 0", 20000, 'kartu frame setelah pindah halaman');

  // --- 4. Frame baru harus langsung tampil di pilihan frame ----------------
  const after = await frameNames();
  check(
    `frame "${NAME}" langsung tampil di pilihan frame tanpa reload`,
    after.includes(NAME),
    `daftar: ${after.join(', ')}`,
  );
  const meta = await evalJs(
    `[...document.querySelectorAll('.template-card')].find((c) => c.querySelector('.template-card__name')?.textContent.trim() === ${JSON.stringify(NAME)})?.querySelector('.template-card__meta')?.textContent.trim() ?? null`,
  );
  check('kartu frame baru memakai jumlah foto yang dipilih (3 slot)', /3 slot/i.test(meta ?? ''), meta ?? '(tidak ada)');

  // --- 5. Bersih-bersih: hapus frame uji lewat API yang sama ----------------
  const del = await fetch(`${BASE}/api/booth/templates/${encodeURIComponent(newId)}`, { method: 'DELETE' });
  check('cleanup: frame uji terhapus dari server', del.ok, `HTTP ${del.status}`);
  const left = existsSync(path.join('public', 'booth', 'templates', newId));
  check('cleanup: folder public/booth/templates ikut terhapus', !left);
} catch (err) {
  console.error('ERROR:', err.message);
  failures++;
} finally {
  chrome.kill();
  vite.kill();
  // Profil Chrome kadang masih terkunci sebentar di Windows — jangan bikin
  // crash setelah semua pemeriksaan selesai.
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* leftover temp */ }
}

console.log(failures === 0 ? '\nSemua pemeriksaan lulus ✦' : `\n${failures} pemeriksaan gagal`);
process.exit(failures === 0 ? 0 : 1);
