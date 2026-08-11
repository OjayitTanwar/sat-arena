'use strict';

// Sanity check: every $('#some-id') referenced in app.js must exist in index.html
const fs = require('fs');

const app = fs.readFileSync('public/app.js', 'utf8');
const html = fs.readFileSync('public/index.html', 'utf8');

const ids = new Set();
const re = /\$\('#([\w-]+)'\)/g;
let m;
while ((m = re.exec(app))) ids.add(m[1]);

// ids created dynamically at runtime (innerHTML / createElement) are fine
const DYNAMIC = new Set(['grid-answer', 'test-grid-answer', 'test-fb', 'test-next-btn']);
const missing = [...ids].filter((id) => !html.includes(`id="${id}"`) && !DYNAMIC.has(id));
console.log('element ids referenced in app.js:', ids.size);
console.log('missing from index.html:', missing.length ? missing.join(', ') : 'NONE ✅');
process.exit(missing.length ? 1 : 0);
