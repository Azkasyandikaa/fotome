/**
 * Verifikasi fitur baru via Chrome CDP (butuh:
 *   1. vite dev        → BASE_URL (default http://localhost:5174)
 *   2. server Express  → PROD_URL (default http://localhost:8787, GALLERY_ADMIN_PASSWORD=Azkasyan77)
 *
 * Yang diuji:
 *   - homepage TIDAK lagi menampilkan strip "FOTOME · STRIP-01 ✦ CONTOH HASIL"
 *   - showcase homepage menampilkan foto featured (atau fallback kartu frame)
 *   - chip kategori #/frames hanya dari daftar kategori + Lainnya
 *   - gerbang 7x → #/devlogin (halaman password) → password benar → #/admin
 *   - panel ⭐ Foto homepage: ceklis, upload, rename, hapus + 10 bentuk tampilan
 *   - leaderboard frame (POST /usage, panel dashboard, top-5 di homepage)
 *   - homepage mengikuti bentuk showcase yang disimpan di server
 *
 * State leaderboard/showcase di-snapshot di awal & dikembalikan di akhir.
 * Screenshot disimpan di scripts/e2e/devgate-*.png
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9700 + Math.floor(Math.random() * 100);
const BASE = process.env.BASE_URL ?? 'http://localhost:5174';
const PROD = process.env.PROD_URL ?? 'http://localhost:8787';
const PW = process.env.GALLERY_ADMIN_PASSWORD ?? 'Azkasyan77';
const OUT = path.join('scripts', 'e2e');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failures++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`);
};

mkdirSync(OUT, { recursive: true });

// Snapshot state leaderboard & showcase → dikembalikan setelah uji, supaya
// data asli pengguna tidak hilang. Isi awal dipastikan bersih agar assertion
// deterministik (leaderboard kosong, bentuk default "bunga").
const LB_FILE = 'public/booth/leaderboard.json';
const SC_FILE = 'public/booth/showcase.json';
const lbBefore = existsSync(LB_FILE) ? readFileSync(LB_FILE, 'utf8') : null;
const scBefore = existsSync(SC_FILE) ? readFileSync(SC_FILE, 'utf8') : null;
writeFileSync(LB_FILE, '{}\n');
writeFileSync(SC_FILE, JSON.stringify({ shape: 'bunga' }) + '\n');

const profile = path.join(os.tmpdir(), 'fotome-devgate-profile');
const chrome = spawn(
  CHROME,
  [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--no-default-browser-check', '--hide-scrollbars',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`,
    '--window-size=1440,950',
  ],
  { stdio: 'ignore' },
);

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
  if (r.result?.exceptionDetails) {
    console.log('      eval error:', r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
    console.log('      eval expr >>>', JSON.stringify(expr));
  }
  return r.result?.result?.value;
};
const waitFor = async (expr, tries = 60) => {
  for (let i = 0; i < tries; i++) {
    if (await evalJs(expr)) return true;
    await sleep(250);
  }
  return false;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  if (r.result?.data) writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, 'base64'));
  console.log(`      saved ${path.join(OUT, name)}`);
};
const goto = async (url) => {
  await send('Page.navigate', { url });
  await sleep(400);
};

await send('Page.enable');
await send('Runtime.enable');

// ---- 0. Reset state featured (login production dulu) -----------------------
const login = await fetch(`${PROD}/api/gallery/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: PW }),
});
const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0];
check('featured: login admin production berhasil', login.ok && !!cookie);
await fetch(`${PROD}/api/gallery/featured`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({ ids: [] }),
});

// ---- 1. Homepage TANPA foto featured → fallback kartu frame -----------------
await goto(`${BASE}/#/`);
check('home: strip contoh lama (FOTOME · STRIP-01) sudah hilang', await waitFor(
  `!document.body.innerText.includes('STRIP-01') && !!document.querySelector('.home__showcase')`, 40,
));
const fallback = JSON.parse(
  (await evalJs(
    `JSON.stringify({
      frames: document.querySelectorAll('.home__showcase-frame').length,
      skel: document.querySelectorAll('.home__showcase-skel').length,
      cap: document.querySelector('[data-showcase-cap]')?.innerText ?? '',
      popHidden: document.querySelector('[data-popular]')?.hidden,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    })`,
  )) ?? '{}',
);
check(
  'home: showcase terisi kartu frame (fallback sebelum ada foto featured)',
  fallback.frames > 0 && fallback.skel === 0,
  JSON.stringify(fallback),
);
check('home: leaderboard tersembunyi saat belum ada data pemakaian', fallback.popHidden === true, JSON.stringify(fallback.popHidden));
check('home: caption fallback mengarah ke pilihan frame', /puluhan frame|pilih sekarang/i.test(fallback.cap ?? ''), fallback.cap);
check('home: tanpa overflow horizontal', (fallback.overflow ?? 99) <= 0, `overflow=${fallback.overflow}px`);
await shot('devgate-01-home-fallback.png');

// ---- 2. Upload 1 foto featured (lewati API production) ----------------------
// Pilih strip terbaru hasil e2e-smoke (kalau ada) supaya showcase mirip hasil
// asli; fallback ke aset bawaan.
const dlDir = path.join(os.tmpdir(), 'fotome-e2e-downloads');
let newestStrip = '';
try {
  const { readdirSync, statSync } = await import('node:fs');
  const strips = readdirSync(dlDir).filter((f) => f.endsWith('.png'));
  if (strips.length > 0) {
    strips.sort((a, b) => statSync(path.join(dlDir, b)).mtimeMs - statSync(path.join(dlDir, a)).mtimeMs);
    newestStrip = path.join(dlDir, strips[0]);
  }
} catch { /* folder tidak ada — pakai fallback */ }
const stripCandidates = [newestStrip, 'public/assets/images/azka.png'].filter(Boolean);
let uploaded = null;
for (const file of stripCandidates) {
  try {
    const bytes = await readFile(file);
    // Endpoint memakai raw body + query (bukan multipart).
    const res = await fetch(`${PROD}/api/gallery/photos?title=Strip%20Uji&template=homepage&featured=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png', Cookie: cookie },
      body: bytes,
    });
    if (res.ok) { uploaded = (await res.json()).id; break; }
    console.log(`      upload via ${file} → HTTP ${res.status}`);
  } catch { /* coba kandidat berikutnya */ }
}
check('featured: upload foto featured ke galeri production', !!uploaded, uploaded ?? 'gagal upload');

// ---- 3. Homepage DENGAN foto featured ---------------------------------------
// Paksa reload: Page.navigate ke URL identik tidak me-refresh halaman.
await evalJs(`location.reload()`);
await sleep(1200);
await waitFor(`!!document.querySelector('.home__showcase')`, 40);
check('home: showcase menampilkan foto featured', await waitFor(
  `document.querySelectorAll('.home__showcase-img').length > 0`, 40,
));
const capFeatured = await evalJs(`document.querySelector('[data-showcase-cap]')?.innerText ?? ''`);
check('home: caption menunjuk galeri fotome', /galeri fotome|intip galeri/i.test(capFeatured), capFeatured);
await shot('devgate-02-home-featured.png');

// ---- 4. Chip kategori #/frames hanya daftar resmi + Lainnya -----------------
await goto(`${BASE}/#/frames`);
await waitFor(`document.querySelectorAll('.cat-chip').length > 0`, 60);
const chips = await evalJs(
  `Array.from(document.querySelectorAll('.cat-chip')).map((b) => b.textContent.trim()).join('|')`,
);
check(
  'frames: chip = Semua + kategori resmi + Lainnya (tanpa chip nama frame)',
  chips === '✨ Semua|Merdeka|Lainnya',
  chips,
);
await shot('devgate-03-frames-chips.png');

// ---- 4b. Leaderboard frame + bentuk showcase (API production) --------------
const usage1 = await fetch(`${PROD}/api/booth/usage`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: 'merdeka1' }),
});
const usage2 = await fetch(`${PROD}/api/booth/usage`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: 'merdeka1' }),
});
const usageCount = usage2.ok ? (await usage2.json()).count : 0;
check('leaderboard: POST /api/booth/usage menghitung 2×', usage1.ok && usageCount === 2, `count=${usageCount}`);
const usageBad = await fetch(`${PROD}/api/booth/usage`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: '../etc/passwd' }),
});
check('leaderboard: id invalid ditolak (400)', usageBad.status === 400, `HTTP ${usageBad.status}`);

const man1 = await (await fetch(`${PROD}/api/booth`)).json();
const lbEntry = (man1.leaderboard ?? []).find((e) => e.id === 'merdeka1');
check('leaderboard: manifest memuat peringkat merdeka1 (count 2)', lbEntry?.count === 2, JSON.stringify(lbEntry));
check('showcase: bentuk default = bunga', man1.showcase?.shape === 'bunga', man1.showcase?.shape);

const putShape = await fetch(`${PROD}/api/booth/showcase`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({ shape: 'kipas' }),
});
const man2 = await (await fetch(`${PROD}/api/booth`)).json();
check('showcase: PUT bentuk "kipas" tersimpan & tampil di manifest',
  putShape.ok && man2.showcase?.shape === 'kipas', man2.showcase?.shape);
const putShapeBad = await fetch(`${PROD}/api/booth/showcase`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({ shape: 'tidak-ada' }),
});
const man3 = await (await fetch(`${PROD}/api/booth`)).json();
check('showcase: bentuk asing ditolak (kembali default bunga)',
  putShapeBad.ok && man3.showcase?.shape === 'bunga', man3.showcase?.shape);
await fetch(`${PROD}/api/booth/showcase`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({ shape: 'kipas' }),
});

// ---- 4c. Homepage ikut bentuk tersimpan + top-5 leaderboard tampil --------
await goto(`${BASE}/#/`);
await waitFor(`document.querySelectorAll('.home__showcase-img').length > 0`, 40);
const homeShape = await evalJs(
  `JSON.stringify({
    cls: document.querySelector('.home__showcase')?.className ?? '',
    popHidden: document.querySelector('[data-popular]')?.hidden,
    rows: document.querySelectorAll('.home__popular-item').length,
    count: document.querySelector('.home__popular-count')?.textContent ?? '',
    ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  })`,
);
const parsedHome = JSON.parse(homeShape ?? '{}');
check('home: mengikuti bentuk showcase tersimpan (kipas)',
  /home__showcase--kipas/.test(parsedHome.cls ?? ''), parsedHome.cls);
check('home: leaderboard top-5 tampil dengan jumlah pemakaian',
  parsedHome.popHidden === false && parsedHome.rows >= 1 && parsedHome.count === '2×', homeShape);
check('home: tanpa overflow setelah perubahan UI', (parsedHome.ovf ?? 99) <= 0, `ovf=${parsedHome.ovf}px`);
await shot('devgate-06-home-shape-popular.png');

// ---- 5. Production: #/devlogin menampilkan form password (tanpa auto-forward)
await goto(`${PROD}/#/devlogin`);
const gateShown = await waitFor(
  `!!document.querySelector('.devlogin__form') && !document.querySelector('.devlogin__form').hidden`, 40,
);
check('devlogin (production): form password tampil & tidak auto-forward', gateShown);
const gateState = JSON.parse(
  (await evalJs(
    `JSON.stringify({ hash: location.hash, title: document.querySelector('.devlogin__title')?.innerText ?? '', pw: !!document.querySelector('[data-devlogin-pw]') })`,
  )) ?? '{}',
);
check('devlogin (production): tetap di #/devlogin dengan input password', gateState.hash === '#/devlogin' && gateState.pw, JSON.stringify(gateState));
await shot('devgate-04-devlogin.png');

// ---- 6. Production: gerbang 7x → devlogin → password salah → benar → admin --
await goto(`${PROD}/#/`);
for (let i = 0; i < 7; i++) {
  await evalJs(`document.querySelector('.site-header__brand')?.click()`);
  await sleep(120);
}
check('gerbang (production): 7 klik membuka #/devlogin', await waitFor(`location.hash === '#/devlogin'`, 40), await evalJs(`location.hash`));
await waitFor(`!!document.querySelector('[data-devlogin-pw]')`, 40);

// Password salah dulu → harus tetap di halaman + hint error.
await evalJs(`(() => {
  const i = document.querySelector('[data-devlogin-pw]');
  i.value = 'password-salah-xyz';
  document.querySelector('[data-devlogin-form]').requestSubmit();
  return true;
})()`);
check('gerbang: password salah ditolak (masih di #/devlogin)', await waitFor(
  `!document.querySelector('[data-devlogin-hint]').hidden && location.hash === '#/devlogin'`, 40,
));

// Password benar → masuk #/admin.
await evalJs(`(() => {
  const i = document.querySelector('[data-devlogin-pw]');
  i.value = ${JSON.stringify(PW)};
  document.querySelector('[data-devlogin-form]').requestSubmit();
  return true;
})()`);
check('gerbang: password benar diteruskan ke #/admin', await waitFor(`location.hash === '#/admin'`, 60), await evalJs(`location.hash`));
check('gerbang: dashboard #/admin ter-render', await waitFor(`!!document.querySelector('.admin')`, 60));
await waitFor(`document.querySelectorAll('.admin-card').length > 0`, 60);

// ---- 6b. Select kategori HANYA dari daftar resmi (Kelola kategori) ---------
await evalJs(`document.querySelector('[data-act="toggle-upload"]')?.click()`);
await sleep(300);
const upCats = await evalJs(
  `Array.from(document.querySelectorAll('[data-up-cat] option')).map((o) => o.textContent.trim()).join('|')`,
);
check(
  'admin: select kategori upload = Tanpa kategori + daftar resmi (tanpa input bebas)',
  upCats === '— Tanpa kategori —|Merdeka',
  upCats,
);
const edCats = await evalJs(
  `Array.from(document.querySelectorAll('[data-t="category"] option')).map((o) => o.textContent.trim()).join('|')`,
);
check(
  'admin: select kategori editor = Tanpa kategori + daftar resmi',
  edCats === '— Tanpa kategori —|Merdeka',
  edCats,
);
const freeInputs = await evalJs(
  `document.querySelectorAll('[data-up-cat]:not(select), input[data-t="category"]').length`,
);
check('admin: tidak ada lagi input teks kategori bebas', freeInputs === 0, `inputs=${freeInputs}`);

// ---- 7. Panel ⭐ Foto homepage ---------------------------------------------
await evalJs(`document.querySelector('[data-act="toggle-showcase"]')?.click()`);
check('admin: panel Foto homepage terbuka dengan grid foto', await waitFor(
  `document.querySelectorAll('.sc-card').length > 0`, 40,
));
const scState = JSON.parse(
  (await evalJs(
    `JSON.stringify({
      cards: document.querySelectorAll('.sc-card').length,
      checked: document.querySelectorAll('.sc-card__cb:checked').length,
      status: document.querySelector('[data-sc-status]')?.innerText ?? '',
      stat: document.querySelector('[data-stat="homepage"] .admin-stat__value')?.textContent ?? '',
    })`,
  )) ?? '{}',
);
check(
  'admin: foto featured terceklis otomatis + status terisi',
  scState.checked > 0 && /foto tampil di homepage/i.test(scState.status) && !scState.stat.includes('…'),
  JSON.stringify(scState),
);
await shot('devgate-05-admin-showcase.png');

// ---- 7b. 10 bentuk tampilan bisa dipilih & tersimpan -----------------------
const shapeUi = JSON.parse(
  (await evalJs(
    `JSON.stringify({
      total: document.querySelectorAll('.sc-shape').length,
      active: document.querySelector('.sc-shape.is-active .sc-shape__label')?.textContent ?? '',
    })`,
  )) ?? '{}',
);
check('admin: 10 bentuk tampilan tersedia di dashboard', shapeUi.total === 10, JSON.stringify(shapeUi));
check('admin: bentuk aktif = tersimpan di server (Kipas)', shapeUi.active === 'Kipas', shapeUi.active);
await shot('devgate-07-admin-shapes.png');

await evalJs(`Array.from(document.querySelectorAll('.sc-shape')).find((b) => b.textContent.includes('Pita'))?.click()`);
check('admin: memilih "Pita Berjalan" → aktif di UI', await waitFor(
  `document.querySelector('.sc-shape.is-active .sc-shape__label')?.textContent === 'Pita Berjalan'`, 40,
));
const shapeAfter = (await (await fetch(`${PROD}/api/booth`)).json()).showcase?.shape;
check('showcase: bentuk pita tersimpan di server lewat UI', shapeAfter === 'pita', shapeAfter);

// ---- 7c. Ganti nama foto homepage (prompt di-stub, endpoint PUT) ----------
await evalJs(`(() => { window.__origPrompt = window.prompt; window.prompt = () => 'Nama Baru'; return true; })()`);
await evalJs(`document.querySelector('.sc-card [data-act="rename"]')?.click()`);
check('admin: rename foto homepage berhasil (PUT /photos/:id)', await waitFor(
  `document.querySelector('.sc-card__title')?.textContent === 'Nama Baru'`, 40,
));
await evalJs(`(() => { window.prompt = window.__origPrompt; return true; })()`);

// ---- 7d. Panel leaderboard frame ------------------------------------------
await evalJs(`document.querySelector('[data-act="toggle-lb"]')?.click()`);
await sleep(300);
const lbUi = JSON.parse(
  (await evalJs(
    `JSON.stringify({
      rows: document.querySelectorAll('.admin__lb-row').length,
      top: document.querySelectorAll('.admin__lb-row.is-top').length,
      count: document.querySelector('.admin__lb-count')?.textContent ?? '',
      badge: document.querySelector('.admin__lb-badge')?.textContent ?? '',
    })`,
  )) ?? '{}',
);
check('admin: leaderboard menampilkan peringkat + jumlah pemakaian',
  lbUi.rows >= 1 && lbUi.top >= 1 && lbUi.count === '2×', JSON.stringify(lbUi));
await shot('devgate-07b-admin-leaderboard.png');

// ---- 8. Homepage langsung memakai bentuk "Pita" hasil ganti dashboard ------
await goto(`${BASE}/#/`);
await waitFor(`document.querySelectorAll('.home__showcase-img').length > 0`, 40);
const pitaState = JSON.parse(
  (await evalJs(
    `JSON.stringify({
      cls: document.querySelector('.home__showcase')?.className ?? '',
      imgs: document.querySelectorAll('.home__showcase-img').length,
    })`,
  )) ?? '{}',
);
check('home: bentuk "Pita Berjalan" langsung terpakai',
  /home__showcase--pita/.test(pitaState.cls ?? ''), pitaState.cls);
check('home: item pita digandakan untuk animasi mulus',
  pitaState.imgs >= 2 && pitaState.imgs % 2 === 0, `imgs=${pitaState.imgs}`);
await shot('devgate-08-home-pita.png');

// ---- 9. Hapus foto homepage dari dashboard --------------------------------
await goto(`${PROD}/#/admin`);
check('admin: sesi login bertahan (dashboard termuat ulang)', await waitFor(
  `document.querySelectorAll('.admin-card').length > 0`, 60,
));
await evalJs(`document.querySelector('[data-act="toggle-showcase"]')?.click()`);
await waitFor(`document.querySelectorAll('.sc-card').length > 0`, 40);
await evalJs(`(() => { window.__origConfirm = window.confirm; window.confirm = () => true; return true; })()`);
await evalJs(`document.querySelector('.sc-card [data-act="del"]')?.click()`);
check('admin: hapus foto dari dashboard mengosongkan grid', await waitFor(
  `document.querySelectorAll('.sc-card').length === 0 && !document.querySelector('[data-sc-empty]').hidden`, 40,
));
await evalJs(`(() => { window.confirm = window.__origConfirm; return true; })()`);
const featAfterDel = await (await fetch(`${PROD}/api/gallery/featured`)).json();
check('featured: foto terhapus permanen dari galeri & homepage', (featAfterDel.photos ?? []).length === 0);

// ---- Cleanup: kembalikan state foto + file leaderboard/showcase -----------
if (uploaded) {
  const still = (await (await fetch(`${PROD}/api/gallery/photos`)).json()).photos ?? [];
  if (still.some((p) => p.id === uploaded)) {
    const del = await fetch(`${PROD}/api/gallery/photos/${uploaded}`, { method: 'DELETE', headers: { Cookie: cookie } });
    check('cleanup: foto uji dihapus dari galeri', del.ok);
  } else {
    check('cleanup: foto uji sudah terhapus lewat UI dashboard', true);
  }
}
if (lbBefore === null) rmSync(LB_FILE, { force: true });
else writeFileSync(LB_FILE, lbBefore);
if (scBefore === null) rmSync(SC_FILE, { force: true });
else writeFileSync(SC_FILE, scBefore);
check('cleanup: file leaderboard & showcase dikembalikan seperti sediakala', true);

console.log(failures === 0 ? '\nSEMUA PASS ✅' : `\n${failures} GAGAL ❌`);
ws.close();
chrome.kill();
process.exit(failures === 0 ? 0 : 1);
