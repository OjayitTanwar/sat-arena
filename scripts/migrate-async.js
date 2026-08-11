'use strict';

// Codemod: migrate server.js from the sync node:sqlite API to the async
// facade (db.prepare(...).all/get/run now return Promises).
//
// For each `db.prepare(<SQL>).<method>(<args>)` expression it inserts:
//   • `await `               → when the result is not chained further
//   • `(await ...)` wrapper  → when the result is chained (e.g. .get().c,
//                              .all(...).map(...)) so member access happens
//                              on the resolved value, not the Promise.
//
// The scanner is string- and comment-aware (single/double quotes, backtick
// template literals treated opaquely, line + block comments).

const fs = require('node:fs');

const FILE = 'server.js';
let code = fs.readFileSync(FILE, 'utf8');
const n = code.length;

function skipString(str, j, quote) {
  let k = j + 1;
  while (k < str.length) {
    const c = str[k];
    if (c === '\\') { k += 2; continue; }
    if (c === quote) return k + 1;
    k++;
  }
  return str.length;
}

// Given i at 'db.prepare(', return { end, chained } or null.
function findDbExpr(str, i) {
  const KW = 'db.prepare(';
  let j = i + KW.length;
  let depth = 1;
  while (j < str.length && depth > 0) {
    const c = str[j];
    if (c === "'") { j = skipString(str, j, "'"); continue; }
    if (c === '"') { j = skipString(str, j, '"'); continue; }
    if (c === '`') { j = skipString(str, j, '`'); continue; }
    if (c === '(') depth++;
    else if (c === ')') depth--;
    j++;
  }
  if (depth !== 0) return null;
  let k = j;
  while (k < str.length && /\s/.test(str[k])) k++;
  if (str[k] !== '.') return null;
  const m = /^(all|get|run)\(/.exec(str.slice(k + 1));
  if (!m) return null;
  let p = k + 1 + m[0].length;
  depth = 1;
  while (p < str.length && depth > 0) {
    const c = str[p];
    if (c === "'") { p = skipString(str, p, "'"); continue; }
    if (c === '"') { p = skipString(str, p, '"'); continue; }
    if (c === '`') { p = skipString(str, p, '`'); continue; }
    if (c === '(') depth++;
    else if (c === ')') depth--;
    p++;
  }
  if (depth !== 0) return null;
  let q = p;
  while (q < str.length && /\s/.test(str[q])) q++;
  return { end: p, chained: str[q] === '.' };
}

const edits = [];
let i = 0;
let inStr = null;       // quote char when inside a string literal
let inLineComment = false;
let inBlockComment = false;

while (i < n) {
  if (inLineComment) {
    if (code[i] === '\n') inLineComment = false;
    i++;
    continue;
  }
  if (inBlockComment) {
    if (code[i] === '*' && code[i + 1] === '/') { inBlockComment = false; i += 2; continue; }
    i++;
    continue;
  }
  if (inStr) {
    if (code[i] === '\\') { i += 2; continue; }
    if (code[i] === inStr) inStr = null;
    i++;
    continue;
  }
  const c = code[i];
  if (c === '/' && code[i + 1] === '/') { inLineComment = true; i += 2; continue; }
  if (c === '/' && code[i + 1] === '*') { inBlockComment = true; i += 2; continue; }
  if (c === "'" || c === '"' || c === '`') { inStr = c; i++; continue; }
  if (code.startsWith('db.prepare(', i)) {
    const r = findDbExpr(code, i);
    if (r) {
      edits.push({ start: i, end: r.end, chained: r.chained });
      i = r.end;
      continue;
    }
  }
  i++;
}

// Apply from the end so offsets stay valid.
for (let e = edits.length - 1; e >= 0; e--) {
  const { start, end, chained } = edits[e];
  if (chained) {
    code = code.slice(0, start) + '(await ' + code.slice(start, end) + ')' + code.slice(end);
  } else {
    code = code.slice(0, start) + 'await ' + code.slice(start, end) + code.slice(end);
  }
}

fs.writeFileSync(FILE, code);
console.log(`Applied await to ${edits.length} db call sites (${edits.filter((x) => x.chained).length} chained).`);
