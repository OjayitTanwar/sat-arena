'use strict';
/* End-to-end verification of the premium/OTP/reset/ads feature set.
 * Boots against a running server on localhost:3000 (fresh DB expected).
 * Usage: node scripts/verify-premium.js
 */
const base = process.argv[2] || 'http://localhost:3000';

// Never let a dead server hang the suite — every request times out in 20s.
const _origFetch = globalThis.fetch;
globalThis.fetch = (url, opts = {}) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  return _origFetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
};

async function j(r) { return r.json(); }

let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}

(async () => {
  // cookie jar per user (login state)
  function newJar() {
    let jar = [];
    return {
      grab(r) { const sc = r.headers.get('set-cookie'); if (sc) { jar = []; jar.push(sc.split(';')[0]); } return r; },
      h() { return { 'Content-Type': 'application/json', Cookie: jar.join('; ') }; },
    };
  }

  const stamp = String(Date.now()).slice(-8);
  const email = 'otp' + stamp + '@t.com';
  const username = 'otp' + stamp;

  console.log('— OTP email signup (dev mode: code comes back in response) —');
  {
    const jar = newJar();
    // 1. request signup code
    let r = await fetch(base + '/api/auth/otp/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, purpose: 'signup' }) });
    let d = await j(r);
    check('request signup code (200 + dev code)', r.status === 200 && /^\d{6}$/.test(d.dev || ''), JSON.stringify(d).slice(0, 120));

    // 2. wrong code rejected
    r = await fetch(base + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, email, password: 'pass123', otp: '000000' }) });
    check('signup with wrong code rejected', r.status === 400);

    // 3. correct code signs up
    r = jar.grab(await fetch(base + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, email, password: 'pass123', otp: d.dev }) }));
    d = await j(r);
    check('signup with correct code (200)', r.status === 200 && d.user && d.user.username === username);
    const userId = d.user.id;

    // 4. plan is free, not premium
    check('new user is free tier', d.user.plan === 'free' && d.user.premium === false);

    // 5. /api/me exposes plan + limits + ads
    r = await fetch(base + '/api/me', { headers: jar.h() });
    d = await j(r);
    check('/api/me has plan + limits', d.plan && d.plan.dailyLimit === 10 && d.plan.tutorLimit === 3 && d.user.premium === false);
    check('/api/me has ads payload', d.ads && typeof d.ads.enabled === 'boolean');

    // 6. duplicate OTP email rejected
    r = await fetch(base + '/api/auth/otp/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, purpose: 'signup' }) });
    check('duplicate signup email rejected (409)', r.status === 409);

    // 7. password reset flow
    r = await fetch(base + '/api/auth/otp/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, purpose: 'reset' }) });
    d = await j(r);
    check('reset code requested (dev)', r.status === 200 && /^\d{6}$/.test(d.dev || ''));
    r = await fetch(base + '/api/auth/reset/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, otp: d.dev, password: 'newpass99' }) });
    check('reset confirm ok', r.status === 200);
    // old password now fails
    r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: email, password: 'pass123' }) });
    check('old password rejected after reset', r.status === 401);
    // new password works
    r = jar.grab(await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: email, password: 'newpass99' }) }));
    d = await j(r);
    check('new password logs in', r.status === 200 && d.user.username === username);

    // 8. subscription info for free user
    r = await fetch(base + '/api/subscription', { headers: jar.h() });
    d = await j(r);
    check('subscription endpoint reports free + price', r.status === 200 && d.premium === false && d.priceCents > 0);

    // 9. free-tier gates
    r = await fetch(base + '/api/topics', { headers: jar.h() });
    check('topics analytics gated for free (402)', r.status === 402);
    r = await fetch(base + '/api/practice-test/start', { method: 'POST', headers: jar.h() });
    check('full test gated for free (402)', r.status === 402);
    r = await fetch(base + '/api/subscribe', { method: 'POST', headers: jar.h() });
    check('subscribe w/o Stripe returns 503 + upgrade flag', r.status === 503);

    // 10. daily question limit: answer 10, then 11th fetch → 402
    console.log('— free daily limit (10) —');
    let limited = false;
    for (let i = 0; i < 11; i++) {
      r = await fetch(base + '/api/question?count=1&adaptive=1', { headers: jar.h() });
      if (r.status === 402) { limited = true; d = await j(r); break; }
      const q = (await j(r)).questions[0];
      if (!q) { console.log('    no question at i=' + i); break; }
      // answer correctly by looking up the cached question's correct index
      const ansRes = await fetch(base + '/api/answer', { method: 'POST', headers: jar.h(), body: JSON.stringify({ questionId: q.id, answerIndex: 0, timeMs: 3000, newRound: i === 0 }) });
      if (ansRes.status !== 200) { console.log('    answer failed at i=' + i + ' status=' + ansRes.status); break; }
    }
    check('11th question blocked (402 + upgrade flag)', limited === true && d && d.upgrade === true, limited ? 'blocked' : 'NOT blocked');
    check('plan payload in 402', d && d.plan && d.plan.dailyUsed === 10);

    // 11. tutor limit: 3 free messages then 402
    console.log('— free tutor limit (3) —');
    let tutorBlocked = false;
    for (let i = 0; i < 4; i++) {
      r = await fetch(base + '/api/tutor', { method: 'POST', headers: jar.h(), body: JSON.stringify({ message: 'test msg ' + i }) });
      if (r.status === 402) { tutorBlocked = true; d = await j(r); break; }
      if (r.status === 500) { console.log('    tutor 500 (AI not configured) — count still logs only on success, skipping'); break; }
    }
    check('tutor blocked after free quota', tutorBlocked && d && d.upgrade === true);

    // 12. admin grants premium for free → all gates open
    console.log('— admin grant premium —');
    const adm = newJar();
    r = adm.grab(await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'tanwarojayit@gmail.com', password: 'baldeyan' }) }));
    check('admin login', r.status === 200);
    r = await fetch(base + '/api/admin/plan', { method: 'POST', headers: adm.h(), body: JSON.stringify({ userId, plan: 'premium' }) });
    check('admin grants premium', r.status === 200);
    // refresh user's session view
    r = await fetch(base + '/api/me', { headers: jar.h() });
    d = await j(r);
    check('user now premium via /api/me', d.user.premium === true && d.ads.enabled === false);
    r = await fetch(base + '/api/practice-test/start', { method: 'POST', headers: jar.h() });
    check('full test unlocked after grant', r.status === 200);
    r = await fetch(base + '/api/topics', { headers: jar.h() });
    check('topics unlocked after grant', r.status === 200);
    r = await fetch(base + '/api/question?count=1&adaptive=1', { headers: jar.h() });
    check('questions unlimited after grant', r.status === 200);
    r = await fetch(base + '/api/subscription', { headers: jar.h() });
    d = await j(r);
    check('subscription reports premium', d.premium === true);

    // 13. admin config exposes new fields
    r = await fetch(base + '/api/admin/config', { headers: adm.h() });
    d = await j(r);
    check('admin config has email/ads/premium fields', d.config && ('resend_api_key' in d.config) && ('ads_code' in d.config) && ('premium_price_cents' in d.config) && ('status' in d && 'email' in d.status));

    // 14. admin users list has plan
    r = await fetch(base + '/api/admin/users', { headers: adm.h() });
    d = await j(r);
    check('admin users list includes plan', Array.isArray(d.users) && d.users.every((u) => 'plan' in u));

    // 15. ads config round-trip (enable → /api/me exposes code → disable)
    r = await fetch(base + '/api/admin/config', { method: 'POST', headers: adm.h(), body: JSON.stringify({ ads_enabled: '1', ads_code: '<div id=\"adtest\"></div><script>window.__adtest=1</script>' }) });
    check('admin saves ads config', r.status === 200);
    const free2 = newJar();
    const fEmail = 'free2' + stamp + '@t.com';
    r = await fetch(base + '/api/auth/otp/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: fEmail, purpose: 'signup' }) });
    const fcode = (await j(r)).dev;
    r = free2.grab(await fetch(base + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'free2' + stamp, email: fEmail, password: 'pass123', otp: fcode }) }));
    check('second free user signs up', r.status === 200);
    r = await fetch(base + '/api/me', { headers: free2.h() });
    d = await j(r);
    check('free user sees ads payload when enabled', d.ads && d.ads.enabled === true && typeof d.ads.code === 'string' && d.ads.code.includes('adtest'));
    r = await fetch(base + '/api/me', { headers: jar.h() });
    d = await j(r);
    check('premium user never sees ads', d.ads && d.ads.enabled === false);
    await fetch(base + '/api/admin/config', { method: 'POST', headers: adm.h(), body: JSON.stringify({ ads_enabled: '', ads_code: '' }) });

    // 17. AdSense auto-ads mode (jar user is still premium here — the revoke
    // check moved to the very end)
    r = await fetch(base + '/api/admin/config', { method: 'POST', headers: adm.h(), body: JSON.stringify({ ads_enabled: '1', ads_network: 'adsense', adsense_client: 'ca-pub-1111222233334444' }) });
    check('admin saves adsense config', r.status === 200);
    r = await fetch(base + '/api/me', { headers: free2.h() });
    d = await j(r);
    check('free user gets adsense payload', d.ads && d.ads.enabled === true && d.ads.network === 'adsense' && d.ads.adsenseClient === 'ca-pub-1111222233334444' && d.ads.code === '');
    r = await fetch(base + '/api/me', { headers: jar.h() });
    d = await j(r);
    check('premium user sees no adsense ads', d.ads && d.ads.enabled === false);

    // 18. Stripe key config wiring: with a key, subscribe must hit Stripe (not 'not configured')
    r = await fetch(base + '/api/admin/config', { method: 'POST', headers: adm.h(), body: JSON.stringify({ stripe_secret_key: 'sk_test_fakekey123' }) });
    check('admin saves stripe key', r.status === 200);
    // config list should include the new fields
    r = await fetch(base + '/api/admin/config', { headers: adm.h() });
    d = await j(r);
    check('admin config has adsense + stripe fields', d.config && ('ads_network' in d.config) && ('adsense_client' in d.config) && ('stripe_secret_key' in d.config));
    const free3 = newJar();
    const f3Email = 'free3' + stamp + '@t.com';
    r = await fetch(base + '/api/auth/otp/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: f3Email, purpose: 'signup' }) });
    const f3code = (await j(r)).dev;
    r = free3.grab(await fetch(base + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'free3' + stamp, email: f3Email, password: 'pass123', otp: f3code }) }));
    check('third free user signs up', r.status === 200);
    r = await fetch(base + '/api/subscription', { headers: free3.h() });
    d = await j(r);
    check('paymentsConfigured true with key saved', d.paymentsConfigured === true);
    r = await fetch(base + '/api/subscribe', { method: 'POST', headers: free3.h() });
    check('subscribe with key reaches Stripe (not 503)', r.status !== 503, 'status=' + r.status);
    // cleanup: explicit clear removes the fake key + ads config (blank = keep)
    r = await fetch(base + '/api/admin/config', { method: 'POST', headers: adm.h(), body: JSON.stringify({ clear: ['stripe_secret_key', 'ads_enabled', 'ads_network', 'adsense_client', 'ads_code'] }) });
    check('admin clears keys/ads', r.status === 200);
    r = await fetch(base + '/api/admin/config', { headers: adm.h() });
    d = await j(r);
    check('stripe key cleared from config', !d.config.stripe_secret_key);
    check('ads config cleared', d.config.ads_enabled !== '1');

    // 19. SMTP email path: configured (even bogus creds) → no dev-code leak
    //     and the route stays up; cleared → dev mode returns codes again.
    r = await fetch(base + '/api/admin/config', { method: 'POST', headers: adm.h(), body: JSON.stringify({ smtp_host: 'smtp.gmail.com', smtp_port: '587', smtp_user: 'tester@gmail.com', smtp_pass: 'bogusapppass123', smtp_secure: '1' }) });
    check('admin saves smtp config', r.status === 200);
    r = await fetch(base + '/api/admin/config', { headers: adm.h() });
    d = await j(r);
    check('smtp fields in config + email status on', d.config && d.config.smtp_host === 'smtp.gmail.com' && d.status && d.status.email === true);
    const f4Email = 'free4' + stamp + '@t.com';
    r = await fetch(base + '/api/auth/otp/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: f4Email, purpose: 'signup' }) });
    d = await j(r);
    check('smtp configured → no dev-code leak', r.status === 200 && d.dev === null);
    r = await fetch(base + '/api/admin/config', { method: 'POST', headers: adm.h(), body: JSON.stringify({ clear: ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_secure'] }) });
    check('admin clears smtp', r.status === 200);
    r = await fetch(base + '/api/auth/otp/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: f4Email, purpose: 'signup' }) });
    d = await j(r);
    check('dev mode returns code again after clear', r.status === 200 && /^\d{6}$/.test(d.dev || ''));

    // 16 (moved here). admin revoke → back to free
    r = await fetch(base + '/api/admin/plan', { method: 'POST', headers: adm.h(), body: JSON.stringify({ userId, plan: 'free' }) });
    check('admin revokes premium', r.status === 200);
    r = await fetch(base + '/api/me', { headers: jar.h() });
    d = await j(r);
    check('user back to free', d.user.premium === false);
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL:', e && e.message ? e.message : e); process.exit(2); });
