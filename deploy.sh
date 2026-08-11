#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  SAT Arena — one-command permanent deploy (Render + Turso)
#  Gives you a STABLE free URL like https://sat-arena.onrender.com that
#  survives restarts, unlike the rotating trycloudflare tunnel.
#
#  What this script does automatically:
#    1. Installs the Turso CLI if missing
#    2. Creates the persistent database + auth token (Turso free tier)
#    3. Writes .env locally so the app runs against Turso right now
#    4. Sets up git if missing and commits
#    5. Creates a GitHub repo (via gh) and pushes — needs `gh auth login` once
#    6. Prints the exact 3 Render Blueprint steps (needs one account signup)
#
#  The ONLY things that need you (email verification, ~5 min total):
#    • `turso auth login`    — opens your browser once
#    • `gh auth login`       — opens your browser once
#    • Render account signup — free, no credit card
#  Everything else is handled here.
# ═══════════════════════════════════════════════════════════════════════════
set -e
cd "$(dirname "$0")"

echo "==> SAT Arena deploy script"
echo "    (local server keeps running at localhost:3000 the whole time)"

# ── 1. Turso CLI ───────────────────────────────────────────────────────────
TURSO_BIN="$HOME/.turso/turso"
if ! command -v turso >/dev/null 2>&1 && [ ! -x "$TURSO_BIN" ]; then
  echo "==> Installing Turso CLI..."
  curl -sSfL https://get.tur.so/install.sh | bash
fi
if [ -x "$TURSO_BIN" ] && ! command -v turso >/dev/null 2>&1; then
  export PATH="$HOME/.turso:$PATH"
fi

# ── 2. Turso login (needs you — one browser click) ─────────────────────────
if ! turso auth list >/dev/null 2>&1; then
  echo ""
  echo "    ┌─────────────────────────────────────────────────────────┐"
  echo "    │  One step needs you: turso auth login                    │"
  echo "    │  Your browser will open. Sign up free (no card).         │"
  echo "    └─────────────────────────────────────────────────────────┘"
  read -r -p "    Press Enter after you've logged in... " _
fi
turso auth list >/dev/null 2>&1 || { echo "Turso login failed — re-run this script."; exit 1; }

# ── 3. Create the database + token ─────────────────────────────────────────
DB_NAME="sat-arena"
echo "==> Ensuring Turso database '$DB_NAME'..."
turso db show "$DB_NAME" >/dev/null 2>&1 || turso db create "$DB_NAME"
TURSO_URL=$(turso db show "$DB_NAME" --url)
TURSO_AUTH_TOKEN=$(turso db tokens create "$DB_NAME" 2>/dev/null | tail -1)
if [ -z "$TURSO_URL" ] || [ -z "$TURSO_AUTH_TOKEN" ]; then
  echo "Could not create the Turso token. Re-run this script."; exit 1
fi

# ── 4. Write .env (local runs against the persistent DB immediately) ───────
{
  echo "TURSO_URL=$TURSO_URL"
  echo "TURSO_AUTH_TOKEN=$TURSO_AUTH_TOKEN"
  echo "APP_URL=https://sat-arena.onrender.com"
} > .env
echo "==> .env written — the local app now uses persistent Turso storage."

# ── 5. Git + GitHub ────────────────────────────────────────────────────────
[ -d .git ] || git init
git add -A
git commit -m "SAT Arena deploy" 2>/dev/null || true
if ! git remote -v | grep -q github; then
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    echo "==> Creating GitHub repo and pushing..."
    gh repo create sat-arena --public --source=. --push
  else
    echo ""
    echo "    ┌─────────────────────────────────────────────────────────┐"
    echo "    │  Needs you once:  gh auth login                          │"
    echo "    │  (or create a repo at github.com and run:                │"
    echo "    │   git remote add origin <url> && git push -u origin main)│"
    echo "    └─────────────────────────────────────────────────────────┘"
  fi
fi

# ── 6. Render instructions ─────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "  LAST STEP (free, no credit card, ~3 min):"
echo ""
echo "  1. Go to https://dashboard.render.com  →  New  →  Blueprint"
echo "  2. Connect your GitHub repo (it auto-detects render.yaml)"
echo "  3. Add these secret env vars:"
echo "       TURSO_URL        = $TURSO_URL"
echo "       TURSO_AUTH_TOKEN = $TURSO_AUTH_TOKEN"
echo "       APP_URL          = https://sat-arena.onrender.com"
echo ""
echo "  Deploy → ~1 min → permanent URL: https://sat-arena.onrender.com"
echo ""
echo "  After that: Google OAuth keys + Gemini key go in Admin panel →"
echo "  Integrations (no redeploy needed)."
echo "════════════════════════════════════════════════════════════════════"
echo ""
echo "==> Done. Your data now lives in Turso (survives everything)."
