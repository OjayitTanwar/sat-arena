#!/usr/bin/env bash
# Prints the current public URL of your running SAT Arena.
# The trycloudflare tunnel URL rotates whenever cloudflared restarts — this
# always tells you the live one. Run:  ./check-url.sh
cd "$(dirname "$0")"
echo -n "Local:  http://localhost:3000"
echo ""
if curl -s -m 3 localhost:3000/api/live-url 2>/dev/null | grep -q '"url"'; then
  echo -n "Public: "
  curl -s -m 3 localhost:3000/api/live-url | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const u=JSON.parse(d).url;console.log(u||'tunnel not running — restart it or run ./deploy.sh')})"
else
  echo "Public: server not running (start it, or open launchctl for com.satarena.server)"
fi
