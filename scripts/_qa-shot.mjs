/** Sementara: screenshot QA desktop + mobile setelah restyle. */
const BASE = 'http://127.0.0.1:5180';

export default async function run(page, ui) {
  await page.evaluate(() => {
    localStorage.setItem('photobooth.onboarded', '1');
    localStorage.removeItem('photobooth.layout');
    delete document.documentElement.dataset.layout;
  });
  await page.reload();

  // ---- DESKTOP ----
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto(BASE + '/#/');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'scripts/e2e/qa-01-home.png', fullPage: true });

  await page.goto(BASE + '/#/frames');
  await page.waitForTimeout(1600);
  await page.screenshot({ path: 'scripts/e2e/qa-02-frames.png' });

  const desktop = await page.evaluate(() => ({
    cards: document.querySelectorAll('.template-card').length,
    catChips: document.querySelectorAll('.cat-row .cat-chip').length,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    heroCols: getComputedStyle(document.querySelector('.home__hero') || document.body).gridTemplateColumns,
  }));

  await page.goto(BASE + '/#/capture');
  await page.waitForTimeout(1800);
  await page.screenshot({ path: 'scripts/e2e/qa-03-capture.png' });

  const capture = await page.evaluate(() => ({
    tplCards: document.querySelectorAll('.tpl-card').length,
    catsWrap: getComputedStyle(document.querySelector('.tpl-cats')).flexWrap,
    catsOverflow: getComputedStyle(document.querySelector('.tpl-cats')).overflowX,
  }));

  // ---- MOBILE ----
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + '/#/frames');
  await page.waitForTimeout(1600);
  await page.screenshot({ path: 'scripts/e2e/qa-04-frames-mobile.png', fullPage: false });

  const mobile = await page.evaluate(() => {
    const row = document.querySelector('.cat-row');
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      rowScrollable: row ? row.scrollWidth > row.clientWidth : false,
      rowWrap: row ? getComputedStyle(row).flexWrap : null,
    };
  });

  await page.goto(BASE + '/#/');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'scripts/e2e/qa-05-home-mobile.png', fullPage: false });

  const homeMobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));

  return { desktop, capture, mobile, homeMobile };
}
