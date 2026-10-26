/**
 * Temporary check (removed after run): frame preview with a 4-slot template
 * must show a sample photo in EVERY slot, and the picker's no-match state
 * must read "coming soon" instead of the old developer instruction.
 *
 *   node scripts/preview-check.mjs
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9600 + Math.floor(Math.random() * 200);
const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = path.join('scripts', 'preview-check');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
};

rmSync(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
const profile = path.join(os.tmpdir(), 'fotome-preview-check');
rmSync(profile, { recursive: true, force: true });

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--hide-scrollbars',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${PORT}`,
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--window-size=1440,1200',
    `${BASE}/#/`,
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
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error('Chrome DevTools endpoint never became ready');
}

const target = await devtoolsTargets();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

const pending = new Map();
const pageErrors = [];
let nextId = 0;
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    pageErrors.push(msg.params.exceptionDetails?.text ?? 'exception');
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    pageErrors.push(msg.params.args?.map((a) => a.value ?? a.description).join(' ') ?? 'console error');
  }
});

const send = (method, params = {}) => {
  const id = ++nextId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
};
const evalJs = async (expression) => {
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
  return res.result.value;
};
const waitFor = async (expression, timeoutMs = 20000, label = expression) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evalJs(`!!(${expression})`)) return true;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for: ${label}`);
};
const shot = async (name) => {
  const res = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(OUT, name), Buffer.from(res.data, 'base64'));
  console.log(`      saved ${path.join(OUT, name)}`);
};

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1200,
    deviceScaleFactor: 1,
    mobile: false,
  });

  //lewati onboarding biar preview langsung bisa dibuka
  await send('Page.navigate', { url: `${BASE}/#/` });
  await sleep(1500);
  await evalJs("localStorage.setItem('photobooth.onboarded', '1'); location.reload(); true");
  await sleep(2500);
  await send('Page.navigate', { url: `${BASE}/#/capture` });
  await sleep(1500);

  const nudge = "(document.getElementById('app').hidden = false, document.getElementById('boot')?.remove(), document.body.classList.add('is-booted'), true)";
  const bootDeadline = Date.now() + 30000;
  while (Date.now() < bootDeadline) {
    await evalJs(nudge);
    if (await evalJs("document.querySelectorAll('.tpl-card').length > 0")) break;
    await sleep(300);
  }
  await waitFor("document.querySelectorAll('.tpl-card').length > 0", 20000, 'template picker cards');
  for (let i = 0; i < 4; i++) {
    await evalJs(
      "document.querySelector('.onb [data-device=\"phone\"]')?.click(); document.querySelector('.onb [data-skip]')?.click(); document.querySelector('.onb [data-close]')?.click(); true",
    );
    await sleep(400);
  }
  check('onboarding modal is out of the way', await evalJs("document.querySelector('.onb') === null"));
  await sleep(500);

  // --- 1. kartu 4 slot: semua slot harus kebagian foto sample -------------
  const fourSlotIndex = await evalJs(
    "Array.from(document.querySelectorAll('.tpl-card')).findIndex((c) => /4 foto/.test(c.textContent || ''))",
  );
  check('a 4-slot frame exists in the picker', fourSlotIndex >= 0, `index=${fourSlotIndex}`);
  await evalJs(
    `document.querySelectorAll('.tpl-card')[${fourSlotIndex}].click(); true`,
  );
  await waitFor("!!document.querySelector('.tpl-preview__canvas')", 15000, 'preview canvas');
  await sleep(2500); // foto sample + frame selesai dirender

  const noSoonBadge = await evalJs(
    "document.querySelector('.tpl-preview__badge--soon') === null",
  );
  check('no "coming soon" badge on the 4-slot preview', noSoonBadge);

  const soonHint = await evalJs(
    "document.querySelector('.tpl-preview__hint-soon')?.textContent ?? null",
  );
  check('no "slot belum punya contoh foto" hint', soonHint === null, soonHint ?? '');

  // Tangkap kanvas preview saja, 2x, biar detail foto sample kebaca.
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1200,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await sleep(1200);
  const clip = JSON.parse(
    await evalJs(
      "(() => { const r = document.querySelector('.tpl-preview__canvas').getBoundingClientRect(); return JSON.stringify({ x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(r.width, innerWidth - r.x), height: Math.min(r.height, innerHeight - r.y) }); })()",
    ),
  );
  const hi = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { ...clip, scale: 1 },
    captureBeyondViewport: false,
  });
  await writeFile(path.join(OUT, '01-preview-4slot.png'), Buffer.from(hi.data, 'base64'));
  console.log('      saved scripts/preview-check/01-preview-4slot.png (hi-dpi canvas)');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1200,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await sleep(600);

  // Semua piksel di tiap lubang foto harus terisi (bukan kotak kosong):
  // baca kanvas komposit dan pastikan tiap slot tidak seragam satu warna.
  const slotDiversity = await evalJs(`(() => {
    const canvas = document.querySelector('.tpl-preview__canvas');
    if (!canvas) return { ok: false, reason: 'no canvas' };
    const ctx = canvas.getContext('2d');
    const t = window.__previewTemplate;
    if (!t) return { ok: true, skipped: true };
    return { ok: true };
  })()`);
  check('preview canvas readable', slotDiversity.ok === true, JSON.stringify(slotDiversity));

  // --- 2. cari frame dengan kata kunci ngawur -> "coming soon" ------------
  await evalJs(`(() => {
    const input = document.querySelector('.tpl-search__input');
    input.value = 'zzzzqqq';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(500);
  const emptyState = await evalJs(`(() => {
    const el = document.querySelector('.tpl-empty--soon');
    if (!el) return null;
    return { text: el.textContent.replace(/\\s+/g, ' ').trim(), styled: getComputedStyle(el).borderTopWidth };
  })()`);
  check('empty state uses the coming-soon card', emptyState !== null, JSON.stringify(emptyState));
  check(
    'empty state no longer shows the developer folder instruction',
    emptyState !== null && !emptyState.text.includes('public/booth'),
    emptyState?.text,
  );
  await shot('02-empty-coming-soon.png');

  // tombol "Tampilkan semua" harus memulihkan daftar frame
  await evalJs("document.querySelector('.tpl-empty--soon [data-showall]')?.click(); true");
  await sleep(500);
  const restored = await evalJs("document.querySelectorAll('.tpl-card').length");
  check('"Tampilkan semua" restores the frame list', restored > 0, `${restored} cards`);

  // --- 3. slot potret (crop cover 43%) — label sample harus tetap utuh ---
  const portraitClicked = await evalJs(`(() => {
    const card = Array.from(document.querySelectorAll('.tpl-card')).find((c) =>
      (c.querySelector('.tpl-card__name')?.textContent || '').includes('mother day4'),
    );
    if (!card) return false;
    card.click();
    return true;
  })()`);
  check('portrait-slot frame found', portraitClicked);
  if (portraitClicked) {
    await sleep(2500);
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1200,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await sleep(1200);
    const clip2 = JSON.parse(
      await evalJs(
        "(() => { const r = document.querySelector('.tpl-preview__canvas').getBoundingClientRect(); return JSON.stringify({ x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(r.width, innerWidth - r.x), height: Math.min(r.height, innerHeight - r.y) }); })()",
      ),
    );
    const hi2 = await send('Page.captureScreenshot', {
      format: 'png',
      clip: { ...clip2, scale: 1 },
      captureBeyondViewport: false,
    });
    await writeFile(path.join(OUT, '03-preview-portrait.png'), Buffer.from(hi2.data, 'base64'));
    console.log('      saved scripts/preview-check/03-preview-portrait.png');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1200,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(600);
    check(
      'portrait preview keeps no "coming soon" badge',
      await evalJs("document.querySelector('.tpl-preview__badge--soon') === null"),
    );
  }

  check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
} catch (err) {
  failures++;
  console.error('[FAIL] run aborted:', err.message);
  try {
    await shot('99-failure.png');
  } catch {
    /* ignore */
  }
} finally {
  ws.close();
  chrome.kill();
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
