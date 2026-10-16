import fs from 'node:fs';
import path from 'node:path';
import { freshDb, TESTS } from './lib.mjs';

const dir = TESTS;
const only = process.argv[2];
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.sql') && (!only || f.includes(only))).sort();
let failed = 0;
for (const f of files) {
  const { db } = await freshDb();
  let lines = [];
  try {
    const results = await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const r of results) for (const row of r.rows ?? []) {
      const v = Object.values(row)[0];
      if (typeof v === 'string' && (/^(ok|not ok) \d+/.test(v) || v.startsWith('#') || v.startsWith('1..'))) lines.push(v);
    }
  } catch (e) {
    lines.push('FATAL: ' + e.message);
    failed++;
  }
  const bad = lines.filter((l) => l.startsWith('not ok') || l.startsWith('#') || l.startsWith('FATAL'));
  const ok = lines.filter((l) => l.startsWith('ok')).length;
  console.log(`\n== ${f}: ${ok} passed, ${bad.length} problem lines`);
  for (const l of bad) console.log('  ' + l.replace(/\n/g, '\n  '));
  if (bad.length) failed++;
}
process.exit(failed ? 1 : 0);
