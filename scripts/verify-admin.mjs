/** Skrip verifikasi cepat: dashboard #/admin + gestur login tersembunyi galeri. */
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { rmSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9600 + Math.floor(Math.random() * 100);
const BASE = process.env.BASE_URL ?? 'http://localhost:5174';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failures++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`);
};

const profile = path.join(os.tmpdir(), 'fotome-verify-profile');
rmSync(profile, { recursive: true, force: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  '--no-default-browser-check', '--hide-scrollbars',
  `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`,
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  '--window-size=1440,1200', `${BASE}/#/`,
], { stdio: 'ignore' });

async function targets() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('Chrome CDP tidak tersedia');
}

const page = await targets();
const ws = new WebSocket(page.webSocketDebuggerUrl);
let msgId = 0;
const pending = new Map();
const events = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method) (events.get(m.method) ?? []).push(m.params);
});
await new Promise((r) => ws.addEventListener('open', r));

const send = (method, params = {}) =>
  new Promise((res) => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};
const waitFor = async (expr, tries = 40) => {
  for (let i = 0; i < tries; i++) {
    if (await evalJs(expr)) return true;
    await sleep(250);
  }
  return false;
};

await send('Page.enable');
await send('Runtime.enable');

// ---- 1. #/admin: dashboard stats ----
await send('Page.navigate', { url: `${BASE}/#/admin` });
await sleep(1500);
const statsVisible = await waitFor(`document.querySelector('[data-stats]') && !document.querySelector('[data-stats]').hidden`);
check('admin: dashboard stats tampil', statsVisible);
const statValues = await evalJs(`Array.from(document.querySelectorAll('.admin-stat__value')).map(e=>e.textContent)`);
check('admin: stats terisi (bukan …)', Array.isArray(statValues) && statValues.every((v) => v && !v.includes('…')), JSON.stringify(statValues));
const uploadBtn = await evalJs(`!!Array.from(document.querySelectorAll('[data-act="toggle-upload"]')).length`);
check('admin: tombol "＋ Frame baru" ada', uploadBtn);
const uploadForm = await evalJs(`!!document.querySelector('[data-upload]')`);
check('admin: form upload frame ada', uploadForm);
const rotField = await evalJs(`!!document.querySelector('[data-f="rotation"]') && !!document.querySelector('[data-f="scale"]')`);
check('admin: field Rotasi + Zoom per slot ada', rotField);
const cardCount = await evalJs(`document.querySelectorAll('.admin-card').length`);
check('admin: daftar frame drop-in termuat', cardCount > 0, `${cardCount} frame`);

// Semua thumbnail frame (PNG hasil optimalisasi palet) wajib ter-decode browser.
// Daftar pakai loading="lazy" — paksa eager dulu supaya kartu di luar
// viewport ikut ter-fetch, lalu assert SEMUA termuat.
await evalJs(`document.querySelectorAll('.admin-card__thumb img').forEach((i) => { i.loading = 'eager'; })`);
await sleep(1500);
const thumbs = await evalJs(`(() => {
  const imgs = Array.from(document.querySelectorAll('.admin-card__thumb img'));
  const failed = imgs.filter((i) => !(i.complete && i.naturalWidth > 0));
  return { total: imgs.length, failed: failed.map((i) => i.getAttribute('src')) };
})()`);
check(
  'admin: semua thumbnail PNG ter-render di browser',
  thumbs.total > 0 && thumbs.failed.length === 0,
  `${thumbs.total - thumbs.failed.length}/${thumbs.total}`,
);

// Klik frame pertama → muncul editor + knob putar.
await evalJs(`document.querySelector('.admin-card')?.click()`);
await sleep(600);
const knob = await evalJs(`!!document.querySelector('.admin-slot__rot')`);
check('admin: knob putar muncul di lubang foto', knob);

// Frame preview besar (frame.png palet) juga harus ter-decode.
const frameLoaded = await evalJs(`(() => {
  const img = document.querySelector('[data-frame]');
  return !!img && img.complete && img.naturalWidth > 0;
})()`);
check('admin: preview frame.png ter-render', frameLoaded);

// Buka form upload.
await evalJs(`document.querySelector('[data-act="toggle-upload"]')?.click()`);
await sleep(300);
const formOpen = await evalJs(`!document.querySelector('[data-upload]').hidden`);
check('admin: form upload bisa dibuka', formOpen);

// ---- 2. #/gallery: TIDAK ADA tombol login sama sekali ----
await send('Page.navigate', { url: `${BASE}/#/gallery` });
await sleep(1500);
await waitFor(`!!document.querySelector('[data-admin-bar]')`);
const loginAbsent = await evalJs(`!document.querySelector('[data-admin-login]')`);
check('galeri: tidak ada elemen tombol login developer', loginAbsent);
const hintText = await evalJs(`document.querySelector('[data-admin-hint]')?.textContent ?? ''`);
check('galeri: bar hanya menampilkan hint publik', hintText.includes('Mode publik'), JSON.stringify(hintText));

// ---- 3. Gestur 7x logo fotome → halaman password #/devlogin → #/admin ----
for (let i = 0; i < 7; i++) {
  await evalJs(`document.querySelector('.site-header__brand')?.click()`);
  await sleep(120);
}
const toastShown = await evalJs(`!!document.querySelector('.toast')`);
check('gestur: toast konfirmasi muncul', toastShown);

// Rekam riwayat hash — gerbang harus mampir ke #/devlogin dulu, lalu
// (mode dev tanpa password) diteruskan otomatis ke #/admin.
const seen = new Set();
let landed = '';
for (let i = 0; i < 80; i++) {
  const h = await evalJs(`location.hash`);
  if (h) seen.add(h);
  if (h === '#/admin' && i > 2) {
    landed = h;
    break;
  }
  await sleep(100);
}
check(
  'gestur: 7 klik logo membuka halaman password #/devlogin',
  seen.has('#/devlogin'),
  [...seen].join(' → '),
);
check('gestur: halaman password diteruskan ke #/admin', landed === '#/admin', landed);
// Tunggu animasi pindah halaman selesai dulu, baru cek DOM.
const adminPageShown = await waitFor(`!!document.querySelector('.admin')`, 40);
check('gestur: halaman developer (#/admin) dirender', adminPageShown);
const devloginGone = await evalJs(`!document.querySelector('.devlogin')`);
check('gestur: halaman password sudah tidak terlihat', devloginGone);

console.log(failures === 0 ? '\nSEMUA PASS ✅' : `\n${failures} GAGAL ❌`);
ws.close();
chrome.kill();
process.exit(failures === 0 ? 0 : 1);
