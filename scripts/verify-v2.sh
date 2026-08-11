#!/bin/bash
# Verify SAT Arena v2: frontend rendering, quick practice w/ grid-ins, drill, full test
set -e
cd "$(dirname "$0")/.."

lsof -ti:3000 | xargs kill -9 2>/dev/null || true
sleep 1
rm -rf data

node server.js > /tmp/satarena.log 2>&1 &
SP=$!
sleep 2

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

echo "=== 1. Frontend loads with no JS console errors ==="
"$CHROME" --headless --disable-gpu --enable-logging=stderr --v=0 \
  --virtual-time-budget=5000 --dump-dom http://localhost:3000 \
  > /tmp/sat_dom3.html 2> /tmp/sat_console3.log || true

grep -iE "error|uncaught|referenceerror|typeerror" /tmp/sat_console3.log \
  | grep -viE "gcm|blink|fontations|network_service|group|favicon" | head -10 \
  || echo "(no obvious JS errors)"
grep -c 'auth-card' /tmp/sat_dom3.html | sed 's/^/auth view rendered: /'

echo
echo "=== 2. Quick practice with a grid-in question (answer correctly via parse) ==="
curl -s -c /tmp/v2.txt -X POST localhost:3000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"username":"v2user","email":"v2@test.com","password":"secret123"}' > /dev/null

# Loop until we get a grid question, answer it correctly by solving from the prompt
for i in $(seq 1 10); do
  curl -s -b /tmp/v2.txt 'localhost:3000/api/question?count=1&section=math' > /tmp/v2q.json
  Q=$(node -e "const j=require('/tmp/v2q.json');const q=j.questions[0];process.stdout.write(JSON.stringify(q))")
  TYPE=$(echo "$Q" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{process.stdout.write(JSON.parse(d).type||'mcq')})")
  if [ "$TYPE" = "grid" ]; then break; fi
done

echo "fetched question type: $TYPE"
if [ "$TYPE" = "grid" ]; then
  QID=$(echo "$Q" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{process.stdout.write(JSON.parse(d).id)})")
  # solve "If ax + b = c" or "What is N% of T?"
  ANSWER=$(echo "$Q" | node -e "
    let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
      const q=JSON.parse(d);
      const lin=q.prompt.match(/\((\d+)x \+ (\d+)\) ÷ (\d+) = (\d+)/);
      if(lin){const a=+lin[1],b=+lin[2],c=+lin[3],d=+lin[4];process.stdout.write(String((d*c-b)/a));return;}
      const pct=q.prompt.match(/What is (\d+)% of (\d+)/);
      if(pct){process.stdout.write(String(+pct[1]/100*+pct[2]));return;}
      process.stdout.write('0');
    })")
  echo "solved answer: $ANSWER"
  curl -s -b /tmp/v2.txt -X POST localhost:3000/api/answer -H 'Content-Type: application/json' \
    -d "{\"questionId\":\"$QID\",\"answerValue\":\"$ANSWER\",\"newRound\":true}" \
    | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('  grid grading: correct='+j.correct+' xp=+'+j.xpEarned)})"
fi

echo
echo "=== 3. Drill by topic ==="
curl -s -b /tmp/v2.txt 'localhost:3000/api/question?count=3&topic=reading-comprehension' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('  all topic=reading-comprehension:', j.questions.every(q=>q.topic==='reading-comprehension'), '| n:', j.questions.length)})"

echo
echo "=== 4. Full practice test flow (adaptive, real length) ==="
curl -s -b /tmp/v2.txt -X POST localhost:3000/api/practice-test/start > /tmp/v2test.json
node -e "
  const j=require('/tmp/v2test.json');
  console.log('  module1s:', j.modules.map(m=>m.key+':'+m.questions.length).join(' '));
  require('fs').writeFileSync('/tmp/v2start.json', JSON.stringify(j));
"
TOKEN=$(node -e "console.log(require('/tmp/v2test.json').token)")
node -e "
  const j=require('/tmp/v2test.json');
  const rw1=j.modules[0], math1=j.modules[1];
  const rw1a={}; rw1.questions.forEach(q=>rw1a[q.id]=q._correct);
  const m1a={}; math1.questions.forEach(q=>m1a[q.id]=q.type==='grid'?'zzz':99);
  require('fs').writeFileSync('/tmp/v2rw1.json', JSON.stringify({token:j.token,moduleKey:'rw1',answers:rw1a}));
  require('fs').writeFileSync('/tmp/v2m1.json', JSON.stringify({token:j.token,moduleKey:'math1',answers:m1a}));
"
curl -s -b /tmp/v2.txt -X POST localhost:3000/api/practice-test/next -H 'Content-Type: application/json' -d @/tmp/v2rw1.json > /tmp/v2rw2.json
curl -s -b /tmp/v2.txt -X POST localhost:3000/api/practice-test/next -H 'Content-Type: application/json' -d @/tmp/v2m1.json > /tmp/v2math2.json
node -e "
  const start=require('/tmp/v2test.json');
  const rw2=require('/tmp/v2rw2.json');
  const math2=require('/tmp/v2math2.json');
  const answers={};
  start.modules.forEach(m=>m.questions.forEach(q=>answers[q.id]=(q.type==='grid')?String(q._answer):q._correct));
  rw2.module.questions.forEach(q=>answers[q.id]=q._correct);
  math2.module.questions.forEach(q=>answers[q.id]=q.type==='grid'?'zzz':99);
  console.log('  rw2 level:', rw2.level, '| math2 level:', math2.level, '| questions:', Object.keys(answers).length, '| all unique:', Object.keys(answers).length===108);
  require('fs').writeFileSync('/tmp/v2body.json', JSON.stringify({token:start.token,answers}));
"
curl -s -b /tmp/v2.txt -X POST localhost:3000/api/practice-test/score -H 'Content-Type: application/json' \
  -d @/tmp/v2body.json \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('  score: rw',j.rw.correct+'/'+j.rw.total,'math',j.math.correct+'/'+j.math.total,'scaled:',j.scaled.total,'grade:',j.grade.grade,'| detail:',j.detail.length)})"

echo
echo "=== 5. Settings + study plan ==="
curl -s -b /tmp/v2.txt -X POST localhost:3000/api/settings -H 'Content-Type: application/json' \
  -d '{"target_date":"2026-11-20","daily_goal":20}' > /dev/null
curl -s -b /tmp/v2.txt localhost:3000/api/study-plan \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('  target:',j.target_date,'| days_left:',j.days_left,'| goal:',j.daily_goal,'| answered_today:',j.answered_today)})"

kill $SP 2>/dev/null || true
echo
echo "DONE"
