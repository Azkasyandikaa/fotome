/**
 * End-to-end smoke test for Fotome, driven straight over CDP with the system
 * Chrome (no test framework). Uses Chrome's fake camera so the whole
 * Home → Capture → Editor → Download flow runs headlessly.
 *
 *   node scripts/e2e-smoke.mjs
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9400 + Math.floor(Math.random() * 200);
const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = path.join('scripts', 'e2e');
const DOWNLOAD_DIR = path.join(os.tmpdir(), 'fotome-e2e-downloads');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name, ok, extra = '') {
  const mark = ok ? 'PASS' : 'FAIL';
  if (!ok) failures++;
  console.log(`[${mark}] ${name}${extra ? ` — ${extra}` : ''}`);
}

// ---------------------------------------------------------------------------
// 1. Launch Chrome
// ---------------------------------------------------------------------------
rmSync(DOWNLOAD_DIR, { recursive: true, force: true });
await mkdir(DOWNLOAD_DIR, { recursive: true });
await mkdir(OUT, { recursive: true });

const profile = path.join(os.tmpdir(), 'fotome-e2e-profile');
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
      /* devtools not up yet */
    }
    await sleep(500);
  }
  throw new Error('Chrome DevTools endpoint never became ready');
}

const target = await devtoolsTargets();
console.log(`Chrome ready: ${target.url}`);

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
    if (msg.error) reject(new Error(`${msg.error.message}: ${msg.error.data ?? ''}`));
    else resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    pageErrors.push(msg.params.exceptionDetails?.text ?? 'exception');
  }
  if (msg.method === 'Log.entryAdded' && msg.params.entry?.level === 'error') {
    pageErrors.push(msg.params.entry.text);
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    pageErrors.push(msg.params.args?.map((a) => a.value ?? a.description).join(' ') ?? 'console error');
  }
  if (msg.method === 'Network.responseReceived' && msg.params.response?.status >= 400) {
    pageErrors.push(`HTTP ${msg.params.response.status} ${msg.params.response.url}`);
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

async function waitFor(expression, timeoutMs = 15000, label = expression) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evalJs(`!!(${expression})`)) return true;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

async function shot(name) {
  const res = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(OUT, name), Buffer.from(res.data, 'base64'));
  console.log(`      saved ${path.join(OUT, name)}`);
}

const click = (selector) => evalJs(`document.querySelector(${JSON.stringify(selector)}).click()`);
const textOf = (selector) => evalJs(`document.querySelector(${JSON.stringify(selector)})?.textContent?.trim() ?? null`);

// ---------------------------------------------------------------------------
// 2. Drive the app
// ---------------------------------------------------------------------------
try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: DOWNLOAD_DIR,
  });

  // Fresh load so the page always runs the code currently on disk.
  await send('Page.navigate', { url: `${BASE}/#/` });
  await sleep(2000);

  // Headless Chrome never fires requestAnimationFrame for a hidden page, so
  // main.ts's boot-screen removal has to be nudged manually in this harness.
  await evalJs(
    "document.getElementById('app').hidden = false; document.getElementById('boot')?.remove(); document.body.classList.add('is-booted'); true",
  );

  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1200,
    deviceScaleFactor: 1,
    mobile: false,
  });

  // --- HOME ---------------------------------------------------------------
  // Poll while re-nudging the boot screen: headless rAF may fire late or never.
  const bootNudge =
    "(document.getElementById('app').hidden = false, document.getElementById('boot')?.remove(), true)";
  const startedAt = Date.now();
  let cardsReady = false;
  while (Date.now() - startedAt < 45000) {
    await evalJs(bootNudge);
    cardsReady = await evalJs(
      "document.querySelectorAll('.feature-card').length > 0",
    );
    if (cardsReady) break;
    await sleep(300);
  }
  if (!cardsReady) {
    console.log(
      'DBG:',
      await evalJs(
        "JSON.stringify({app: !!document.getElementById('app'), hidden: document.getElementById('app')?.hidden, boot: !!document.getElementById('boot'), features: document.querySelectorAll('.feature-card').length, body: document.body.innerHTML.length})",
      ),
    );
    console.log('DBG errors:', pageErrors.slice(0, 6));
    throw new Error('Timed out waiting for: home feature cards');
  }
  await sleep(600);

  // --- ONBOARDING (profile baru — muncul sekali per browser) -------------
  await waitFor("!!document.querySelector('[data-device=\"phone\"]')", 15000, 'onboarding: step device');
  check('onboarding opens with the HP/Desktop choice', true);
  await evalJs("document.querySelector('[data-device=\"phone\"]').click()");
  await waitFor("!!document.querySelector('.onb [data-guide]')", 8000, 'onboarding: step guide');
  const guideOffer = await textOf('.onb [data-guide]');
  check('onboarding step 2 offers the guide', /Baca guide/i.test(guideOffer ?? ''), guideOffer);
  await evalJs("document.querySelector('.onb [data-skip]').click()");
  await sleep(400);

  const onbState = await evalJs(
    "JSON.stringify({ done: localStorage.getItem('photobooth.onboarded'), layout: document.documentElement.dataset.layout, modal: !!document.querySelector('.modal-backdrop') })",
  );
  const parsedOnb = JSON.parse(onbState);
  check(
    'onboarding saved layout=phone + done flag, modal closed',
    parsedOnb.done === '1' && parsedOnb.layout === 'phone' && parsedOnb.modal === false,
    onbState,
  );
  const heroOneCol = await evalJs(
    "getComputedStyle(document.querySelector('.home__hero')).gridTemplateColumns.split(' ').length",
  );
  check('forced phone layout stacks the hero (1 column)', heroOneCol === 1, `cols=${heroOneCol}`);

  // Kembalikan ke layout responsif default untuk sisa pemeriksaan.
  await evalJs(
    "localStorage.removeItem('photobooth.layout'); delete document.documentElement.dataset.layout; true",
  );
  await sleep(300);

  // Tombol "📖 Cara pakai" di hero tetap membuka guide.
  await evalJs("document.querySelector('.home__actions [data-guide]').click()");
  await waitFor("location.hash === '#/guide'", 8000, 'route #/guide via hero button');
  await evalJs("location.hash = '#/'");
  await waitFor("document.querySelectorAll('.feature-card').length > 0", 20000, 'back to home');
  await sleep(400);

  const stepsBarGone = await evalJs(
    "document.querySelector('.steps-bar') === null && document.querySelectorAll('.steps__item').length === 0",
  );
  check('top step strip (1 Pilih Frame … 4 Unduh) removed', stepsBarGone);

  const featureCount = await evalJs("document.querySelectorAll('.feature-card').length");
  check('home shows feature cards instead of the old step walls', featureCount >= 4, `${featureCount} cards`);
  const oldStepsGone = await evalJs(
    "document.querySelectorAll('.home__step').length === 0 && /Langkah 1/.test(document.body.innerText) === false",
  );
  check('no "Langkah 1/2/3" sections left on Home', oldStepsGone);

  // Ikon fitur di kartu home: SVG garis, bukan emoji navigasi.
  const featureIcons = await evalJs(
    "Array.from(document.querySelectorAll('.feature-card__icon')).filter((el) => el.querySelector('svg')).length",
  );
  check('feature cards use line icons (not emoji)', featureIcons >= 4, `${featureIcons} svg icons`);

  const cta = await textOf('.home__actions [data-start]');
  check('primary CTA copy', /^Mulai Fotobooth/.test(cta ?? ''), `"${cta}"`);

  // --- HALAMAN #/FRAMES ----------------------------------------------------
  await evalJs("document.querySelector('.home__actions [data-frames]').click()");
  await waitFor("location.hash === '#/frames'", 8000, 'route #/frames');
  await waitFor("document.querySelectorAll('.template-card').length > 0", 20000, 'frames page cards');
  await sleep(500);

  const templateCount = await evalJs("document.querySelectorAll('.template-card').length");
  check('template cards rendered on #/frames', templateCount > 0, `${templateCount} cards`);

  const slotButtons = await evalJs(
    "Array.from(document.querySelectorAll('[data-slotfilter] .slot-filter__btn')).map((b) => b.textContent.trim()).join('|')",
  );
  check(
    'slot filter offers Semua + slot 1–5 in one scrollable row',
    slotButtons === '✨ Semua|1 foto|2 foto|3 foto|4 foto|5 foto',
    slotButtons,
  );
  const slotNoWrap = await evalJs(
    "getComputedStyle(document.querySelector('[data-slotfilter]')).flexWrap",
  );
  check('slot filter never stacks (single scroll row)', slotNoWrap === 'nowrap', slotNoWrap);

  // Kategori: baris chip selalu tampil & digulir horizontal (bukan drawer
  // yang menutupi preview/grid frame), dan berada DI ATAS baris slot 1–5.
  const catsState = await evalJs(
    "JSON.stringify({ wrap: getComputedStyle(document.querySelector('[data-catchips]')).flexWrap, overflow: getComputedStyle(document.querySelector('[data-catchips]')).overflowX, chips: document.querySelectorAll('[data-catchips] .cat-chip').length, drawer: !!document.querySelector('[data-cats]') })",
  );
  const parsedCats = JSON.parse(catsState);
  check(
    'category row is always visible and scrolls horizontally',
    parsedCats.wrap === 'nowrap' && parsedCats.overflow === 'auto' && parsedCats.chips > 0 && !parsedCats.drawer,
    catsState,
  );

  const filterOrder = await evalJs(
    "JSON.stringify({ catTop: Math.round(document.querySelector('[data-catchips]').getBoundingClientRect().top), slotTop: Math.round(document.querySelector('[data-slotfilter]').getBoundingClientRect().top) })",
  );
  const parsedOrder = JSON.parse(filterOrder);
  check(
    'categories sit above the 1–5 slot filter',
    parsedOrder.catTop > 0 && parsedOrder.catTop < parsedOrder.slotTop,
    filterOrder,
  );

  // is-end harus mencerminkan status scroll sebenarnya: baris yang muat tanpa
  // guliran = is-end; baris yang masih ada sisa = belum is-end. (Jumlah chip
  // kategori kini mengikuti daftar resmi — tidak meluap — jadi assertion-nya
  // mengikuti kondisi baris, bukan asumsi selalu ada yang bisa digeser.)
  const trackFades = await evalJs(
    "JSON.stringify(Array.from(document.querySelectorAll('[data-track]')).map((t) => ({ slack: t.scrollWidth - t.clientWidth, atEnd: t.classList.contains('is-end') })))",
  );
  const parsedTracks = JSON.parse(trackFades);
  check(
    'both filter rows track their scroll position (edge fade)',
    parsedTracks.length === 2 &&
      parsedTracks.every((t) => t.atEnd === (t.slack <= 2)),
    trackFades,
  );

  const frameSettings = await evalJs(
    "JSON.stringify({ shown: !document.querySelector('[data-framesettings]').hidden, shots: document.querySelector('[data-fs-shots]')?.textContent })",
  );
  check('frame settings panel reports the shot count', /foto/.test(JSON.parse(frameSettings).shots ?? ''), frameSettings);

  // Filter slot tanpa frame → pesan kosong yang jelas, lalu kembali.
  await evalJs("document.querySelector('[data-slotfilter] [data-slots=\"5\"]').click()");
  await sleep(300);
  const emptyTitle = await textOf('.empty-state__title');
  check('5-slot filter explains there is no such frame yet', /Belum ada frame dengan 5 slot/.test(emptyTitle ?? ''), emptyTitle);
  await evalJs("document.querySelector('[data-resetfilter]')?.click()");
  await sleep(300);

  const privacyGone = await evalJs("document.querySelector('.home__privacy') === null");
  check('hero privacy line removed', privacyGone);

  const bg = await evalJs("getComputedStyle(document.body).backgroundColor");
  check('body uses --color-bg (#edeffc stardust)', bg === 'rgb(237, 239, 252)', bg);

  const font = await evalJs("getComputedStyle(document.body).fontFamily");
  check('UI font is Nunito', /Nunito/.test(font), font.split(',')[0]);

  await evalJs("document.querySelectorAll('.template-card')[1].click()");
  await sleep(300);
  const selectedBadge = await evalJs("!!document.querySelector('.template-card.is-selected .template-card__badge')");
  check('selected template shows "Dipilih" badge', selectedBadge);

  await shot('01b-frames.png');

  // Kembali ke home untuk screenshot + cek mobile.
  await evalJs("location.hash = '#/'");
  await waitFor("document.querySelectorAll('.feature-card').length > 0", 15000, 'back to home');
  await sleep(500);

  await shot('01-home-desktop.png');

  // Mobile viewport check (spec: rapi dari 360px)
  await send('Emulation.setDeviceMetricsOverride', {
    width: 360,
    height: 780,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await sleep(400);
  const overflow = await evalJs(
    "document.documentElement.scrollWidth - document.documentElement.clientWidth",
  );
  check('no horizontal overflow at 360px (Home)', overflow <= 1, `overflow=${overflow}px`);
  const stickyVisible = await evalJs(
    "getComputedStyle(document.querySelector('.sticky-bar')).position === 'fixed'",
  );
  check('sticky action bar active on mobile', stickyVisible);
  await shot('02-home-mobile.png');

  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1200,
    deviceScaleFactor: 1,
    mobile: false,
  });

  // --- CAPTURE ------------------------------------------------------------
  await evalJs("document.querySelector('.home__actions [data-start]').click()");
  await waitFor("location.hash === '#/capture'", 8000, 'route #/capture');
  // Capture opens on the frame-confirm step; the camera starts after PILIH.
  await waitFor("document.querySelectorAll('.tpl-card').length > 0", 15000, 'template picker');
  await evalJs("document.querySelector('.tpl-card').click()");
  await sleep(300);
  await evalJs("document.querySelector('[data-act=\"choose\"]').click()");
  await waitFor("!!document.querySelector('.camera__video')", 15000, 'camera preview');
  await waitFor("document.querySelector('.camera__video').readyState >= 2", 15000, 'camera stream live');

  const hasFooter = await evalJs(
    "getComputedStyle(document.querySelector('.site-footer')).display !== 'none'",
  );
  check('footer hidden on Capture', !hasFooter);

  const previewRadius = await evalJs(
    "getComputedStyle(document.querySelector('.camera__stage')).borderRadius",
  );
  check('camera preview has rounded frame', parseFloat(previewRadius) > 0, previewRadius);

  // Ukuran kamera: elemen terbesar di layar foto (desktop) — kini LEBAR 5:4
  // (cap 640px): tinggi tetap penuh, lebar naik dari cap 560 → 640 biar
  // tidak sempit. HP tetap potret 3:4 (aturan media query terpisah).
  const stageBox = await evalJs(
    "JSON.stringify({ w: Math.round(document.querySelector('.camera__stage').getBoundingClientRect().width), h: Math.round(document.querySelector('.camera__stage').getBoundingClientRect().height), vw: innerWidth })",
  );
  const parsedStage = JSON.parse(stageBox);
  check(
    'camera stage is wide (5:4, capped 640px) on desktop',
    parsedStage.h >= 420 && parsedStage.w <= 640 && parsedStage.w >= 520,
    stageBox,
  );

  // Di ponsel kamera harus potret, bukan crop 16/10 yang kecil.
  await send('Emulation.setDeviceMetricsOverride', {
    width: 360,
    height: 780,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await sleep(400);
  const mobileStage = await evalJs(
    "JSON.stringify({ w: Math.round(document.querySelector('.camera__stage').getBoundingClientRect().width), h: Math.round(document.querySelector('.camera__stage').getBoundingClientRect().height) })",
  );
  const parsedMobile = JSON.parse(mobileStage);
  check(
    'camera is portrait and tall on phones',
    parsedMobile.h / parsedMobile.w >= 1.25 && parsedMobile.h >= 420,
    `${parsedMobile.w}x${parsedMobile.h}`,
  );
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1200,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await sleep(400);

  // --- TIMER COUNTDOWN ---------------------------------------------------
  // Baris timer tampil bawaan di halaman foto (buka/tutup lewat tombol ⏱).
  const timers = await evalJs(
    "JSON.stringify({ hidden: document.querySelector('.camera__timers').hidden, chips: Array.from(document.querySelectorAll('.camera__timers [data-timer]')).map((b) => b.dataset.timer).join(','), active: document.querySelector('.camera__timers .is-active')?.dataset.timer, filters: document.querySelectorAll('.camera__filters .chip--filter').length })",
  );
  const parsedTimers = JSON.parse(timers);
  check(
    'camera timer options visible by default (3/5/10/off, default 3s)',
    !parsedTimers.hidden && parsedTimers.chips === '3,5,10,off' && parsedTimers.active === '3',
    timers,
  );
  check('live filter dock offers plenty of filters', parsedTimers.filters >= 40, `${parsedTimers.filters} filters`);

  await evalJs("document.querySelector('[data-act=\"timer\"]').click()");
  await sleep(250);
  const timerHidden = await evalJs("document.querySelector('.camera__timers').hidden");
  check('⏱ button folds the timer row', timerHidden === true);
  await evalJs("document.querySelector('[data-act=\"timer\"]').click()");
  await sleep(250);

  await shot('03-capture.png');

  // Countdown: pilih timer 5 detik, angka pertama harus “5” — bukan “3”
  // bawaan — dan overlay-nya lapisan layar penuh.
  await evalJs("document.querySelector('[data-timer=\"5\"]').click()");
  await sleep(150);
  await click('[data-act="capture"]');
  await sleep(200);
  const cd = await evalJs(
    "JSON.stringify({ pos: document.querySelector('.countdown-overlay') ? getComputedStyle(document.querySelector('.countdown-overlay')).position : null, first: document.querySelector('.countdown-number')?.textContent })",
  );
  const parsedCd = JSON.parse(cd);
  check('countdown overlay is a fullscreen layer', parsedCd.pos === 'fixed', cd);
  check('countdown starts at the chosen timer (5, not 3)', parsedCd.first === '5', cd);
  await sleep(6600); // 5s countdown + jepret + flash
  check('photo 1 captured', (await evalJs("document.querySelectorAll('.camera__dots i.is-done').length")) >= 1);

  // Sisa jepretan tanpa timer supaya run cepat.
  await click('[data-timer="off"]');
  await sleep(150);
  await click('[data-act="capture"]'); // jeda → LANJUT
  await sleep(1800);
  check('photo 2 captured', (await evalJs("document.querySelectorAll('.camera__dots i.is-done').length")) >= 2);

  // Jepretan terakhir: tidak ada jeda tambahan — tombol MULAI ULANG /
  // LANJUT EDIT harus muncul sendiri begitu foto masuk.
  await click('[data-act="capture"]'); // jeda → LANJUT, jepretan 3 jalan
  await waitFor(
    "document.querySelectorAll('.camera__dots i.is-done').length === 3",
    15000,
    'shot 3 done',
  );
  const reviewAuto = await evalJs(
    "!document.querySelector('.camera__review').hasAttribute('hidden')",
  );
  check('final review opens right after the last shot (no extra shutter press)', reviewAuto === true);
  await shot('04-capture-complete.png');
  await click('[data-act="confirm"]');
  await waitFor("location.hash === '#/edit'", 10000, 'route #/edit');

  // --- EDITOR -------------------------------------------------------------
  await waitFor("!!document.querySelector('.editor__canvas')", 10000, 'editor canvas');
  await sleep(800);

  const tabCount = await evalJs("document.querySelectorAll('.editor__photo-tab').length");
  check('photo tabs (Foto 1/2/3)', tabCount === 3, `${tabCount} tabs`);

  const nextLabel = await textOf('[data-ed="download"]');
  check('editor primary CTA copy', nextLabel === 'Lanjut ke Unduh', `"${nextLabel}"`);

  // Add a sticker through the sticker picker, then undo/redo.
  await waitFor(
    "document.querySelectorAll('.editor__stickers .sticker-btn').length > 0",
    20000,
    'sticker picker',
  );
  await evalJs("document.querySelector('.editor__stickers .sticker-btn').click()");
  await sleep(1200);

  // Stiker tersorot → panel layer + tombol depan/belakang frame tampil.
  const frameToggle = await textOf('[data-prop="toggle-frame"]');
  check(
    'layer panel offers the front/behind frame toggle',
    /Di atas frame|Di belakang frame/.test(frameToggle ?? ''),
    frameToggle,
  );

  // Klik tab foto → panel ukuran foto (zoom/geser/putar di dalam lubang) tampil.
  await evalJs("document.querySelector('.editor__photo-tab').click()");
  await sleep(600);
  const photoPanel = await evalJs(
    "JSON.stringify({ hidden: document.querySelector('.editor__photo-props')?.hidden, slot: document.querySelector('[data-pc-slot]')?.textContent, scale: document.querySelector('input[data-pc=\"scale\"]')?.value })",
  );
  const parsedPhotoPanel = JSON.parse(photoPanel);
  check(
    'photo tab opens the photo size panel (default 100%)',
    parsedPhotoPanel.hidden === false && parsedPhotoPanel.scale === '1',
    photoPanel,
  );
  // Zoom foto lewat slider — hasilnya dipakai render akhir.
  await evalJs(
    "(() => { const s = document.querySelector('input[data-pc=\"scale\"]'); s.value = '1.4'; s.dispatchEvent(new Event('input', { bubbles: true })); return true; })()",
  );
  await sleep(500);
  const photoScaleLabel = await evalJs(
    "document.querySelector('.editor__photo-props output')?.textContent",
  );
  check('photo zoom slider updates the label', photoScaleLabel === '140%', photoScaleLabel);

  await shot('05-editor.png');

  // --- DOWNLOAD -----------------------------------------------------------
  await click('[data-ed="download"]');
  await waitFor("location.hash === '#/download'", 10000, 'route #/download');
  await waitFor(
    "document.querySelector('.download__frame canvas') !== null || document.querySelector('.download__frame .skeleton') !== null",
    10000,
    'download page',
  );
  await waitFor(
    "document.querySelector('.download__frame.is-ready canvas') !== null",
    15000,
    'composite preview',
  );

  const resolution = await textOf('[data-resolution]');
  check('output resolution shown', /×\s*\d+\s*px/.test(resolution ?? ''), resolution);

  const sizeText = await textOf('[data-size]');
  check('estimated file size computed', /KB|MB|B$/.test(sizeText ?? ''), sizeText);

  const pngActive = await evalJs(
    "document.querySelector('[data-format=\"png\"]').classList.contains('is-active')",
  );
  check('PNG is the default format', pngActive);

  await shot('06-download.png');

  await click('[data-download]');
  await waitFor("document.querySelector('.dl-modal') !== null", 8000, 'download success modal');
  const dlQuestion = await textOf('.dl-modal__question');
  check(
    'success popup asks "Mau pajang fotomu di website?"',
    /Mau pajang fotomu di website/.test(dlQuestion ?? ''),
    dlQuestion,
  );
  const dlPrompt = await textOf('.dl-modal__prompt');
  check('…with the admin pitch below it', /kirim fotonya ke admin/i.test(dlPrompt ?? ''), dlPrompt);
  const adminBtn = await evalJs(
    "Array.from(document.querySelectorAll('.dl-modal a')).some((a) => (a.getAttribute('href') || '').includes('wa.me'))",
  );
  check('WhatsApp link stays inactive until admin.chatUrl is configured', adminBtn === false);
  const disabledYes = await evalJs(
    "document.querySelector('.dl-modal .btn--primary')?.disabled === true",
  );
  check('…the "Ya, kirim ke admin" button shows but is disabled', disabledYes === true);
  await shot('06b-download-success-modal.png');
  await evalJs("document.querySelector('.dl-modal [data-close]').click()");
  await sleep(400);

  const files = await readdir(DOWNLOAD_DIR);
  const exported = files.find((f) => /^fotostrip-.*\.(png|jpg)$/.test(f));
  check('exported file on disk', Boolean(exported), exported ?? `dir: ${JSON.stringify(files)}`);

  // JPEG switch
  await click('[data-format="jpeg"]');
  await sleep(1500);
  const jpegName = await evalJs("document.querySelector('[data-filename]').value");
  check('filename follows the format switch', /\.jpg$/.test(jpegName ?? ''), jpegName);

  // "Edit Ulang" keeps the decorations
  await click('[data-edit]');
  await waitFor("location.hash === '#/edit'", 10000, 'back to #/edit');
  await sleep(1500);
  const restored = await evalJs(
    "document.querySelectorAll('.editor__photo-tab').length",
  );
  check('Edit Ulang returns to the editor', restored === 3, `tabs=${restored}`);

  // Confetti: kanvas layar penuh (bukan elemen alur dokumen).
  const confetti = await evalJs(
    "JSON.stringify({ exists: !!document.querySelector('.confetti-canvas'), pos: document.querySelector('.confetti-canvas') ? getComputedStyle(document.querySelector('.confetti-canvas')).position : null })",
  );
  const parsedConfetti = JSON.parse(confetti);
  check(
    'confetti canvas is a fullscreen overlay',
    !parsedConfetti.exists || parsedConfetti.pos === 'fixed',
    confetti,
  );

  // --- HALAMAN TUTORIAL / KREDIT / GALERI (dulu tanpa gaya sama sekali) ---
  await evalJs("location.hash = '#/guide'");
  await waitFor("location.hash === '#/guide' && document.querySelectorAll('.guide-step').length > 0", 12000, 'route #/guide');
  await sleep(400);
  const guideState = await evalJs(
    "JSON.stringify({ steps: document.querySelectorAll('.guide-step').length, radius: getComputedStyle(document.querySelector('.guide-step')).borderRadius, tips: document.querySelectorAll('.tip-card').length, flow: document.querySelectorAll('.guide-flow__node').length })",
  );
  const parsedGuide = JSON.parse(guideState);
  check(
    'guide page renders 4 styled steps + tips + flow',
    parsedGuide.steps === 4 && parseFloat(parsedGuide.radius) > 0 && parsedGuide.tips >= 3 && parsedGuide.flow === 4,
    guideState,
  );
  await shot('07-guide.png');

  await evalJs("location.hash = '#/credit'");
  await waitFor("location.hash === '#/credit' && !!document.querySelector('.credit__card')", 12000, 'route #/credit');
  await sleep(400);
  const creditState = await evalJs(
    "JSON.stringify({ display: getComputedStyle(document.querySelector('.credit__card')).display, tech: document.querySelectorAll('.credit__tech-item').length, support: !!document.querySelector('.credit__support') })",
  );
  const parsedCredit = JSON.parse(creditState);
  check(
    'credit page shows the profile card + tech chips + support panel',
    parsedCredit.display === 'flex' && parsedCredit.tech >= 1 && parsedCredit.support,
    creditState,
  );
  await shot('08-credit.png');

  await evalJs("location.hash = '#/gallery'");
  await waitFor("location.hash === '#/gallery' && !!document.querySelector('.gallery__grid')", 12000, 'route #/gallery');
  await sleep(800);
  const galleryState = await evalJs(
    "JSON.stringify({ padding: getComputedStyle(document.querySelector('.gallery')).paddingTop, admin: !!document.querySelector('.gallery__admin'), emptyShown: document.querySelector('[data-empty-public]')?.hidden === false })",
  );
  const parsedGallery = JSON.parse(galleryState);
  check(
    'gallery page lays out (grid + admin bar + empty state when API is off)',
    parseFloat(parsedGallery.padding) > 0 && parsedGallery.admin && parsedGallery.emptyShown,
    galleryState,
  );
  await shot('09-gallery.png');

  // --- RAPI DI 360px -------------------------------------------------------
  await send('Emulation.setDeviceMetricsOverride', {
    width: 360,
    height: 780,
    deviceScaleFactor: 2,
    mobile: true,
  });
  for (const [hash, marker] of [
    ['#/', '.home'],
    ['#/frames', '.frames'],
    ['#/guide', '.guide'],
    ['#/credit', '.credit'],
    ['#/gallery', '.gallery'],
  ]) {
    await evalJs(`location.hash = ${JSON.stringify(hash)}`);
    await waitFor(`!!document.querySelector(${JSON.stringify(marker)})`, 12000, `route ${hash}`);
    await sleep(400);
    const spill = await evalJs(
      "document.documentElement.scrollWidth - document.documentElement.clientWidth",
    );
    check(`no horizontal overflow at 360px (${hash})`, spill <= 1, `overflow=${spill}px`);
  }
  await shot('10-gallery-mobile.png');

  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1200,
    deviceScaleFactor: 1,
    mobile: false,
  });

  await evalJs("location.hash = '#/'");
  await waitFor("document.querySelectorAll('.feature-card').length > 0", 15000, 'back home');
  await sleep(300);

  // /api/gallery is an optional server feature proxied to :8787 in dev; with
  // that server off the proxy answers 500 and the app degrades gracefully.
  const isOptionalGalleryNoise = (e) =>
    /\/api\/gallery/.test(e) ||
    (/Failed to load resource/.test(e) && pageErrors.some((x) => /\/api\/gallery/.test(x)));
  const realErrors = pageErrors.filter((e) => !isOptionalGalleryNoise(e));
  check('no uncaught page errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
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
