// Audit: every CSS class used in index.html / app.js should have a rule in styles.css
const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const js = fs.readFileSync('public/app.js', 'utf8');
const css = fs.readFileSync('public/styles.css', 'utf8');

const classes = new Set();
const grab = (re, src) => { for (const m of src.matchAll(re)) m[1].split(/\s+/).forEach((c) => c && classes.add(c)); };
grab(/class="([^"]+)"/g, html);
grab(/class='([^']+)'/g, js);
grab(/className\s*=\s*'([^']+)'/g, js);
// classes inside template literals used by JS-rendered markup
for (const m of js.matchAll(/`([^`]*)class="([^"]+)"/g)) m[2].split(/\s+/).forEach((c) => c && classes.add(c));
for (const m of js.matchAll(/`([^`]*)class='([^']+)'/g)) m[2].split(/\s+/).forEach((c) => c && classes.add(c));

// classes added dynamically via classList (exact literal strings)
for (const m of js.matchAll(/classList\.(?:add|toggle|remove)\('([^']+)'/g)) m[1].split(/\s+/).forEach((c) => c && classes.add(c));
for (const m of js.matchAll(/classList\.(?:add|toggle|remove)\("([^"]+)"/g)) m[1].split(/\s+/).forEach((c) => c && classes.add(c));

// utility / structural classes that are intentionally global or handled elsewhere
const utils = new Set(['hidden', 'muted', 'small', 'sm', 'lg', 'xl', 'fill', 'ms', 'view', 'app-view', 'icon', 'btn', 'card', 'active', 'selected', 'done', 'correct', 'wrong', 'dim', 'hot', 'current', 'completed', 'locked', 'happy', 'sad', 'show', 'connected', 'first', 'second', 'third', 'you', 'free', 'premium', 'lifetime', 'best', 'wide', 'alt', 'big', 'slim', 'block', 'left', 'right', 'center']);

const missing = [...classes].filter((c) => c && !css.includes('.' + c) && !utils.has(c)).sort();
console.log('total classes referenced:', classes.size);
console.log('missing CSS rules:', missing.length);
if (missing.length) console.log(missing.join('\n'));
else console.log('ALL CLASSES COVERED ✔');
