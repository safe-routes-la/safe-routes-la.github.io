#!/usr/bin/env node
/* Every string the page can show has a translation in every language pack.
 *
 *   node tools/i18n_check.mjs
 *
 * English lives in index.html (elements with data-t, data-tp or data-tt) and
 * in the EN table in app.js (strings built at run time). Each other language
 * is a file like es.js whose `s` replaces the HTML strings and whose `d`
 * replaces the EN table. This fails if a key is missing from a pack, if a pack
 * carries a key nothing uses, if a translation drops or invents a {placeholder},
 * or if app.js asks t() for a key the EN table does not have. Missing keys do
 * not break the page (it falls back to English), which is why nothing else
 * notices: in Spanish the Tour button was announced in English until this
 * existed. Node only, no packages. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(root, f), 'utf8');
const html = read('index.html');
const app = read('app.js');

const htmlKeys = new Set([...html.matchAll(/\sdata-t[pt]?="([^"]+)"/g)].map(m => m[1]));

const enSrc = app.match(/\nconst EN = (\{[\s\S]*?\n\});/);
if (!enSrc) { console.error('i18n_check: could not find the EN table in app.js'); process.exit(1); }
const EN = vm.runInNewContext(`(${enSrc[1]})`);

// Keys app.js asks for by name. Keys built at run time (`tour.${k}h`,
// 'win.' + b) are checked through the EN table instead.
const used = new Set([
  ...[...app.matchAll(/\bt\('([^']+)'\s*[,)]/g)].map(m => m[1]),
  ...[...app.matchAll(/\bsetDyn\([^,]+,\s*'([^']+)'/g)].map(m => m[1]),
  ...[...app.matchAll(/\b(?:labelKey|hintKey|none):\s*'([^']+)'/g)].map(m => m[1]),
]);

const ctx = { window: {} };
vm.runInNewContext(read('es.js'), ctx);
const packs = ctx.window.LANGS || {};

const placeholders = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
const problems = [];

for (const k of used) if (!(k in EN)) problems.push(`app.js uses t('${k}') but EN has no '${k}'`);

for (const [lang, pack] of Object.entries(packs)) {
  const s = pack.s || {}, d = pack.d || {};
  for (const k of htmlKeys) if (!(k in s)) problems.push(`${lang}.s is missing '${k}' (index.html)`);
  for (const k of Object.keys(s)) if (!htmlKeys.has(k)) problems.push(`${lang}.s has '${k}', which index.html does not use`);
  for (const k of Object.keys(EN)) {
    if (!(k in d)) { problems.push(`${lang}.d is missing '${k}' (app.js)`); continue; }
    if (placeholders(EN[k]) !== placeholders(d[k])) {
      problems.push(`${lang}.d['${k}'] has placeholders {${placeholders(d[k])}}, English has {${placeholders(EN[k])}}`);
    }
  }
  for (const k of Object.keys(d)) if (!(k in EN)) problems.push(`${lang}.d has '${k}', which app.js does not define`);
}

const nPacks = Object.keys(packs).length;
if (problems.length) {
  for (const p of problems) console.error(`  FAIL  ${p}`);
  console.error(`i18n_check: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`i18n_check: ${htmlKeys.size} page strings and ${Object.keys(EN).length} run-time strings `
  + `are translated in ${nPacks} language pack(s), with matching placeholders`);
