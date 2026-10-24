/**
 * Screenshot halaman developer (#/admin, #/devlogin) lewat server Express.
 *   node scripts/_shot-dev.mjs [baseUrl] [password] [tag]
 * Output: scripts/e2e/<tag>-<nama>.png
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] ?? 'http://localhost:8787';
const PW = process.argv[3] ?? process.env.GALLERY_ADMIN_PASSWORD ?? 'rahasia';
const TAG = process.argv[4] ?? 'dev';
const OUT = path.join('scripts', 'e2e');
const PORT = 9750 + Math.floor(Math.random() * 40);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await mkdir(OUT, { recursive: true });
const profile = path.join(os.tmpdir(), `fotome-shot-dev-${PORT}`);
rmSync(profile, { recursive: true, force: true });

const chrome = spawn(
  CHROME,
  [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--no-default-browser-check', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1600',
  ],
  { stdio: 'ignore' },
);

let target = null;
for (let i = 0; i < 60 && !target; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const list = await res.json();
    target = list.find((t) => t.type === 'page');
  } catch { /* not ready */ }
  if (!target) await sleep(400);
}
if (!target) { chrome.kill(); throw new Error('Chrome DevTools tidak siap'); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});
const pending = new Map();
let nid = 0;
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) reject(new Error(m.error.message));
    else resolve(m.result);
  }
});
const send = (method, params = {}) => {
  const id = ++nid;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
};

async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) {
    console.log('eval err:', r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return null;
  }
  return r.result.value;
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(OUT, `${TAG}-${name}.png`);
  await writeFile(file, Buffer.from(r.data, 'base64'));
  console.log('saved', file);
}
const waitFor = async (expr, n = 48) => {
  for (let i = 0; i < n; i++) {
    if (await evalJs(expr)) return true;
    await sleep(250);
  }
  return false;
};

/** Lewati onboarding kalau muncul (pilih desktop → skip guide). */
async function dismissOnboarding() {
  await evalJs(`(()=>{const b=document.querySelector('[data-device="desktop"]');if(b){b.click();return true}return false})()`);
  await sleep(500);
  await evalJs(`(()=>{const b=document.querySelector('[data-skip]');if(b){b.click();return true}return false})()`);
  await sleep(500);
}

try {
  await send('Page.enable');
  await send('Runtime.enable');

  // ---- #/devlogin (tanpa sesi) --------------------------------------------
  await send('Page.navigate', { url: `${BASE}/#/devlogin` });
  await sleep(2200);
  await dismissOnboarding();
  await waitFor(`!!document.querySelector('.devlogin__card')`, 40);
  await shot('01-devlogin');

  // ---- login → #/admin -----------------------------------------------------
  await evalJs(`(()=>{const i=document.querySelector('[data-devlogin-pw]');if(!i)return false;i.value=${JSON.stringify(PW)};document.querySelector('[data-devlogin-form]').requestSubmit();return true})()`);
  const gotAdmin = await waitFor(`location.hash==='#/admin' && !!document.querySelector('.admin')`, 60);
  console.log('login → #/admin:', gotAdmin);
  await dismissOnboarding();
  await waitFor(`document.querySelectorAll('.admin-card').length>0`, 60);
  await sleep(1200);
  await shot('02-admin-top');

  // ---- panel ⭐ Foto homepage ----------------------------------------------
  await evalJs(`document.querySelector('[data-act="toggle-showcase"]')?.click()`);
  await waitFor(`!document.querySelector('[data-showcase]')?.hidden`, 30);
  await sleep(2500);
  await shot('03-admin-showcase');
  await evalJs(`document.querySelector('[data-act="toggle-showcase"]')?.click()`);
  await sleep(400);

  // ---- editor slot (klik frame pertama) ------------------------------------
  await evalJs(`document.querySelector('.admin-card')?.click()`);
  await sleep(1200);
  await shot('04-admin-editor');

  // ---- full page -----------------------------------------------------------
  await shot('05-admin-full');
  console.log('hash akhir:', await evalJs('location.hash'));
} finally {
  try { chrome.kill(); } catch { /* ignore */ }
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
  ws.close();
}
