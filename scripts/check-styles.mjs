/** Dev helper: report class names used under src/ (TypeScript) that no stylesheet defines.
 *  Usage: node scripts/check-styles.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk('src');
const cssFiles = files.filter((f) => f.endsWith('.css'));
const tsFiles = files.filter((f) => f.endsWith('.ts'));

const defined = new Set();
for (const f of cssFiles) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/\.([a-zA-Z0-9_-]+)/g)) defined.add(m[1]);
}

const used = new Map();
const add = (cls, file) => {
  if (!cls || /[${}'"`\\]/.test(cls)) return;
  for (const c of cls.split(/\s+/)) {
    if (!c || defined.has(c)) continue;
    if (!used.has(c)) used.set(c, new Set());
    used.get(c).add(path.basename(file));
  }
};

for (const f of tsFiles) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/class(?:Name)?\s*=\s*["'`]([^"'`]+)["'`]/g)) add(m[1], f);
  for (const m of s.matchAll(/classList\.(?:add|toggle|remove)\(([^)]*)\)/g)) {
    for (const q of m[1].matchAll(/["'`]([^"'`]+)["'`]/g)) add(q[1], f);
  }
}

const list = [...used.entries()].map(([c, fs]) => `${c}  <- ${[...fs].join(', ')}`).sort();
console.log(`unstyled classes: ${list.length}`);
console.log(list.join('\n'));
