#!/bin/bash
# =============================================================================
# sms-router deploy (stage only). Usage: ./deploy.sh stage [--yes]
# Copies code to the stage server, installs prod deps and (re)starts the PM2 app.
# The server-side .env is created once by hand and is NEVER touched by this script.
# =============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Server details live in a git-ignored file so they never reach this public repo.
# Copy .deploy.env.example to .deploy.env and fill it in.
[[ -f "$SCRIPT_DIR/.deploy.env" ]] && source "$SCRIPT_DIR/.deploy.env"
: "${SSH_USER:?Set SSH_USER in .deploy.env}"
: "${SSH_HOST:?Set SSH_HOST in .deploy.env}"
: "${SSH_KEY:?Set SSH_KEY in .deploy.env}"
REMOTE_PATH="${REMOTE_PATH:-/var/www/sms-router}"
PM2_APP="${PM2_APP:-sms-router}"
PORT="${PORT:-3050}"

GREEN='\033[0;32m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
fail()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

ENV_NAME=""; YES=false
for arg in "$@"; do
  case $arg in
    stage) ENV_NAME="stage" ;;
    prod|production) fail "Production deploy is not set up for sms-router yet." ;;
    --yes|-y) YES=true ;;
    *) fail "Unknown argument: $arg" ;;
  esac
done
[[ "$ENV_NAME" == "stage" ]] || fail "Usage: ./deploy.sh stage [--yes]"

cd "$SCRIPT_DIR"
SSH="ssh -i $SSH_KEY -o ConnectTimeout=20"
REMOTE="$SSH_USER@$SSH_HOST"

info "Running unit tests..."
npm test --silent >/dev/null || fail "Unit tests failed; not deploying."
ok "Tests passed"

info "Checking the server..."
$SSH "$REMOTE" "test -d $REMOTE_PATH" || fail "$REMOTE_PATH does not exist on the server."
$SSH "$REMOTE" "test -s $REMOTE_PATH/.env" || fail "$REMOTE_PATH/.env is missing on the server; create it first."
ok "Server ready"

if [[ "$YES" == false ]]; then
  echo -n "Deploy sms-router to $REMOTE:$REMOTE_PATH ? [y/N]: "; read -r yn
  [[ "$yn" == "y" || "$yn" == "Y" ]] || fail "Aborted."
fi

info "Copying code (never .env*, node_modules, .git, tests)..."
rsync -az --delete \
  --exclude='node_modules' --exclude='.git' --exclude='.env' --exclude='.env.*' --exclude='.deploy.env*' \
  --exclude='test' --exclude='*.log' --exclude='.DS_Store' --exclude='deploy.sh' \
  -e "$SSH" "$SCRIPT_DIR/" "$REMOTE:$REMOTE_PATH/"
ok "Code copied"

info "Installing production dependencies..."
$SSH "$REMOTE" "cd $REMOTE_PATH && npm ci --omit=dev --silent"
ok "Dependencies installed"

info "Starting/reloading PM2 app $PM2_APP..."
$SSH "$REMOTE" "cd $REMOTE_PATH && pm2 startOrReload ecosystem.config.js --update-env >/dev/null && pm2 save >/dev/null"
ok "PM2 app running"

sleep 3
CODE=$($SSH "$REMOTE" "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$PORT/health" || echo "000")
[[ "$CODE" == "200" ]] || fail "Health check failed (HTTP $CODE). Check: ssh $REMOTE 'pm2 logs $PM2_APP --lines 50'"
ok "Health check passed (HTTP $CODE)"
echo -e "${GREEN}sms-router deployed to $ENV_NAME${NC}"
