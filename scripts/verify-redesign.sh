#!/bin/bash
# Verify the redesigned frontend: landing DOM, design tokens, and the logged-in API flow.
set -e
cd "$(dirname "$0")/.."

lsof -ti:3000 | xargs kill -9 2>/dev/null || true
sleep 1
# Run against the LOCAL db so the email provider is unset and the dev OTP
# (returned in the API response) is available — otherwise real emails are sent.
TURSO_URL= TURSO_AUTH_TOKEN= node server.js > /tmp/sat_redesign.log 2>&1 &
SP=$!
echo -n "waiting for server boot"
for i in $(seq 1 15); do
  sleep 2
  if curl -s -o /dev/null http://localhost:3000 2>/dev/null; then echo " ... up (~$((i*2))s)"; break; fi
  echo -n "."
done

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

echo "=== 1. Landing DOM (after JS init) ==="
"$CHROME" --headless --disable-gpu --virtual-time-budget=6000 --dump-dom http://localhost:3000 > /tmp/sat_redesign_dom.html 2>/dev/null || true
echo "landing-hero:      $(grep -c 'landing-hero' /tmp/sat_redesign_dom.html)"
echo "view-auth:         $(grep -c 'id="view-auth"' /tmp/sat_redesign_dom.html)"
echo "material symbols:  $(grep -c 'workspace_premium' /tmp/sat_redesign_dom.html)"
echo "auth card:         $(grep -c 'auth-card' /tmp/sat_redesign_dom.html)"

echo
echo "=== 2. Fresh-user API flow (signup w/ dev OTP -> dashboard -> store -> leaderboard) ==="
UNIQ="vt$(date +%s)"
EMAIL="${UNIQ}@test.com"
CODE=$(curl -s -X POST localhost:3000/api/auth/otp/request -H 'Content-Type: application/json' \
  -d "{\"email\":\"${EMAIL}\",\"purpose\":\"signup\"}" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).dev||'')}catch(e){console.log('')}})")
echo "otp dev code: ${CODE:-(EMPTY!)}"
curl -s -c /tmp/sat_redesign_cookie.txt -X POST localhost:3000/api/auth/signup -H 'Content-Type: application/json' \
  -d "{\"username\":\"${UNIQ}\",\"email\":\"${EMAIL}\",\"password\":\"secret123\",\"otp\":\"${CODE}\"}" | head -c 160
echo
echo "login:"
curl -s -c /tmp/sat_redesign_cookie.txt -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' \
  -d "{\"identifier\":\"${EMAIL}\",\"password\":\"secret123\"}" | head -c 120
echo
for ep in me dashboard store leaderboard subscription topics; do
  printf "%-14s -> " "/api/$ep"
  curl -s -b /tmp/sat_redesign_cookie.txt "localhost:3000/api/$ep" | head -c 90
  echo
done
echo "question fetch:"
curl -s -b /tmp/sat_redesign_cookie.txt "localhost:3000/api/question?count=2" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const q=JSON.parse(d);console.log('  questions:',q.questions.length,'| section:',q.questions[0].section)}catch(e){console.log('  FAILED:',d.slice(0,120))}})"

kill $SP 2>/dev/null || true
echo
echo "done."
