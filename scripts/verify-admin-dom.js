// Verify the fix: #view-admin must be a SIBLING of #view-tutor, not nested inside it.
const fs = require('node:fs');
const html = fs.readFileSync('public/index.html', 'utf8');

// Track section open/close to find which section contains #view-admin.
const stack = [];
const re = /<section[^>]*id="([^"]+)"[^>]*>|<\/section>/g;
let m;
let adminParent = null;
while ((m = re.exec(html)) !== null) {
  if (m[1]) {
    stack.push(m[1]);
  } else {
    stack.pop();
  }
  if (m[1] === 'view-admin') {
    adminParent = stack[stack.length - 2] || '(top level)';
    break;
  }
}
console.log('admin section parent:', adminParent);
if (adminParent === 'view-tutor') {
  console.log('FAIL: admin is still nested inside tutor');
  process.exit(1);
}
if (adminParent === '(top level)') {
  console.log('PASS: admin is a top-level sibling');
} else {
  console.log('WARN: admin parent is ' + adminParent + ' — check this is intended');
}
