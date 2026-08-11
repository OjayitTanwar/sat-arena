#!/bin/bash
# Verify SAT Arena frontend rendering + backend flow
set -e
cd "$(dirname "$0")/.."

# kill anything on port 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
sleep 1

node server.js > /tmp/satarena.log 2>&1 &
SP=$!
sleep 2

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

echo "=== 1. JS console errors while loading the app ==="
"$CHROME" --headless --disable-gpu --enable-logging=stderr --v=0 \
  --virtual-time-budget=5000 --dump-dom http://localhost:3000 \
  > /tmp/sat_dom2.html 2> /tmp/sat_console.log || true

# extract console messages
grep -i "console\|error\|uncaught\|referenceerror\|typeerror" /tmp/sat_console.log | grep -v "GCM\|group\|blink\|Fontations\|network_service" | head -20 || echo "(no obvious JS errors)"

echo
echo "=== 2. DOM sanity after JS init (should show auth view visible) ==="
grep -o 'id="view-auth"' /tmp/sat_dom2.html | head -1
grep -c 'auth-card' /tmp/sat_dom2.html

echo
echo "=== 3. API flow: signup -> question -> answer -> dashboard -> leaderboard -> tutor ==="
rm -f /tmp/v_cookies.txt
curl -s -c /tmp/v_cookies.txt -X POST localhost:3000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"username":"verifyuser","email":"verify@test.com","password":"secret123"}' | head -c 120
echo

curl -s -b /tmp/v_cookies.txt 'localhost:3000/api/question?count=2' > /tmp/v_q.json
echo "questions fetched:"
node -e "const q=require('/tmp/v_q.json'); console.log('  count:', q.questions.length, '| first section:', q.questions[0].section, '| choices:', q.questions[0].choices.length, '| correctIndex hidden:', q.questions[0].correctIndex === undefined, '| _key not exposed:', q.questions[0]._key === undefined)"

# answer with the server-side correct answer by re-deriving? We can't from client. Just answer 0 and report.
QID=$(node -e "const q=require('/tmp/v_q.json'); process.stdout.write(q.questions[0].id)")
RES=$(curl -s -b /tmp/v_cookies.txt -X POST localhost:3000/api/answer -H 'Content-Type: application/json' \
  -d "{\"questionId\":\"$QID\",\"answerIndex\":0,\"timeMs\":3000}")
echo "answer response:"
echo "$RES" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('  correct:', j.correct, '| xpEarned:', j.xpEarned, '| has explanation:', !!j.explanation, '| newBadges:', (j.newBadges||[]).map(b=>b.id))})"

echo "dashboard:"
curl -s -b /tmp/v_cookies.txt localhost:3000/api/dashboard | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('  username:', j.user.username, '| answered:', j.stats.totalAnswered, '| badges:', j.badges.length, '| tutor:', j.tutor.provider)})"

echo "leaderboard rows:"
curl -s -b /tmp/v_cookies.txt localhost:3000/api/leaderboard | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('  top:', j.leaderboard.slice(0,2).map(r=>r.username).join(', '))})"

echo "tutor:"
curl -s -b /tmp/v_cookies.txt -X POST localhost:3000/api/tutor -H 'Content-Type: application/json' \
  -d '{"message":"what is the quadratic formula?"}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('  reply head:', j.reply.slice(0,80), '| provider:', j.provider)})"

echo
echo "=== 4. Unauthenticated access is rejected ==="
curl -s -o /dev/null -w "  /api/dashboard without cookie: %{http_code}\n" localhost:3000/api/dashboard

kill $SP 2>/dev/null || true
echo
echo "DONE"
