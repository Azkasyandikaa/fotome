/** Sekali jalan: melembutkan stylesheet ke tema "soft candy clean".
 *  node scripts/_soften.mjs  —  dipakai saat restyle, boleh dihapus setelahnya. */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const files = readdirSync('src/styles')
  .filter((f) => f.endsWith('.css'))
  .map((f) => 'src/styles/' + f);

const softSmall = '0 3px 10px rgb(255 111 174 / 0.14)';
const softBig = '0 14px 30px rgb(167 139 250 / 0.16)';
const softGlow = '0 10px 24px rgb(255 93 158 / 0.18)';

let total = 0;

for (const file of files) {
  const before = readFileSync(file, 'utf8');
  let css = before;

  // box-shadow: <a>px <b>px 0 var(--ink) → bayangan lembut (sisa nilai dipertahankan)
  css = css.replace(
    /box-shadow:\s*([0-9.]+)px\s+([0-9.]+)px\s+0\s+var\(--(?:color-)?ink\)/g,
    (match, a) => {
      total++;
      return `box-shadow: ${Math.max(Number(a), 4) >= 4 ? softBig : softSmall}`;
    },
  );

  // box-shadow: <a>px <b>px 0 var(--red-soft) (tanpa spread) → glow lembut
  css = css.replace(/box-shadow:\s*([0-9.]+)px\s+([0-9.])px\s+0\s+var\(--red-soft\)/g, () => {
    total++;
    return `box-shadow: ${softGlow}`;
  });

  // border tipis pastel menggantikan garis tinta tebal
  css = css.replace(
    /(border(?:-[a-z]+)?):\s*[0-9.]+px solid var\(--(?:color-)?ink\)/g,
    (match, prop) => {
      total++;
      return `${prop}: 1.5px solid var(--color-border-strong)`;
    },
  );

  if (css !== before) writeFileSync(file, css);
}

console.log(`softened ${total} declarations across ${files.length} files`);
