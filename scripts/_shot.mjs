/**
 * Screenshot QA — beberapa halaman fotome sekaligus (onboarding dilewati).
 * Pakai Chrome headless + CDP langsung (tanpa Playwright).
 *
 *   node scripts/_shot.mjs [baseUrl] [outDir] [tag]
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = process.argv[3] ?? 'scripts/e2e';
const TAG = process.argv[4] ?? 'ui';
const PORT = 9600 + Math.floor(Math.random() * 300);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await mkdir(OUT, { recursive: true });
const profile = path.join(os.tmpdir(), `fotome-shot-${PORT}`);
rmSync(profile, { recursive: true, force: true });

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${PORT}`,
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--window-size=1440,1000',
    `${BASE}/#/`,
  ],
  { stdio: 'ignore' },
);

let target = null;
for (let i = 0; i < 60 && !target; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const list = await res.json();
    target = list.find((t) => t.type === 'page' && /localhost/.test(t.url));
  } catch {
    /* not ready */
  }
  if (!target) await sleep(400);
}
if (!target) {
  chrome.kill();
  throw new Error('Chrome DevTools tidak siap');
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

const pending = new Map();
let nextId = 0;
const consoleErrors = [];

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
    consoleErrors.push(msg.params.exceptionDetails?.text ?? 'exception');
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    consoleErrors.push(
      msg.params.args?.map((a) => a.value ?? a.description).join(' ') ?? 'console error',
    );
  }
});

function send(method, params = {}) {
  const id = ++nextId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evalJs(expression) {
  const res = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
  }
  return res.result.value;
}

async function shot(name, fullPage = false) {
  const params = { format: 'png' };
  if (fullPage) {
    const { cssContentSize } = await send('Page.getLayoutMetrics');
    params.clip = {
      x: 0,
      y: 0,
      width: cssContentSize.width,
      height: Math.min(cssContentSize.height, 4000),
      scale: 1,
    };
    params.captureBeyondViewport = true;
  }
  const res = await send('Page.captureScreenshot', params);
  const file = path.join(OUT, `${TAG}-${name}.png`);
  await writeFile(file, Buffer.from(res.data, 'base64'));
  console.log('saved', file);
}

const PAGES = [
  ['home', '#/'],
  ['frames', '#/frames'],
  ['capture', '#/capture'],
  ['gallery', '#/gallery'],
  ['guide', '#/guide'],
  ['credit', '#/credit'],
];

try {
  await send('Page.enable');
  await send('Runtime.enable');

  /* Pastikan document sudah di origin localhost sebelum menyentuh localStorage
     — di about:blank eval pembungkusan menghasilkan SecurityError. */
  await send('Page.navigate', { url: `${BASE}/#/` });
  await sleep(2500);

  await evalJs(
    "localStorage.setItem('photobooth.onboarded','1'); localStorage.setItem('photobooth.layout','desktop'); location.reload(); true",
  );
  /* reload: gerbang onboarding dibaca saat render, jadi storage harus diset
     SEBELUM shell di-render ulang. */
  await sleep(2500);

  for (const [width, height, suffix] of [
    [1440, 950, 'desk'],
    [390, 844, 'mob'],
  ]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 600,
    });
    for (const [name, hash] of PAGES) {
      await send('Page.navigate', { url: `${BASE}/${hash}` });
      await sleep(1800);
      await evalJs(
        "document.getElementById('app')?.removeAttribute('hidden'); document.getElementById('boot')?.remove(); document.body.classList.add('is-booted'); true",
      );
      await sleep(900);
      await shot(`${name}-${suffix}`);
    }
  }

  const metrics = await evalJs(`JSON.stringify({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    bodyW: document.body.scrollWidth,
    clientW: document.documentElement.clientWidth,
  })`);
  console.log('metrics', metrics);
  if (consoleErrors.length) console.log('console errors:', consoleErrors.slice(0, 10));
  else console.log('no console errors');
} finally {
  try {
    chrome.kill();
  } catch {
    /* ignore */
  }
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* chrome masih megang profil — abaikan */
  }
}
