/**
 * Dev helper: screenshot beberapa halaman fotome sekaligus (onboarding dilewati).
 *   node scripts/_shots.mjs <baseUrl> <outDir>
 */
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv[2] ?? 'http://localhost:5175';
const outDir = process.argv[3] ?? 'shots';

fs.mkdirSync(outDir, { recursive: true });

const pages = [
  ['home', '#/'],
  ['frames', '#/frames'],
  ['gallery', '#/gallery'],
  ['guide', '#/guide'],
];

export default async function run(page) {
  const report = [];
  await page.addInitScript(() => {
    localStorage.setItem('photobooth.onboarded', '1');
    localStorage.setItem('photobooth.layout', 'desktop');
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const [name, hash] of pages) {
    await page.goto(`${base}/${hash}`, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(outDir, `${name}-top.png`) });
    await page.evaluate(() => window.scrollTo(0, 950));
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, `${name}-mid.png`) });
    report.push({ name, url: page.url(), h: await page.evaluate(() => document.body.scrollHeight) });
  }
  return report;
}
