#!/usr/bin/env bash
# A private crewhub-loops for development, next to (never inside) the Mac app: its own checkout, port, data folder
# and Unix socket. Nothing here touches ~/Library/Application Support/be.ekinsol.crewhub, port 8091 or launchd.
#
#   tools/loops-dev.sh start | stop | status | log | setup-token | env
#
# Env (all optional): LOOPS_DEV_CHECKOUT (a crewhub-loops checkout with services/api synced by uv and apps/web built),
# LOOPS_DEV_DATA (0700 folder), LOOPS_DEV_PORT (default 8291), LOOPS_DEV_OWNER (first account id, default nicky).
set -euo pipefail

CHECKOUT="${LOOPS_DEV_CHECKOUT:-$HOME/Documents/GitHub/crewhub-loops-world}"
DATA="${LOOPS_DEV_DATA:-$HOME/crewhub-loops-dev}"
PORT="${LOOPS_DEV_PORT:-8291}"
OWNER="${LOOPS_DEV_OWNER:-nicky}"
PID_FILE="$DATA/run/serve.pid"
LOG_FILE="$DATA/serve.log"

case "$PORT" in 8091|8000|9443) echo "loops-dev: port $PORT is reserved (the Mac app, make dev-api, the nginx https port)" >&2; exit 2;; esac
[ -d "$CHECKOUT/services/api" ] || { echo "loops-dev: no checkout at $CHECKOUT" >&2; exit 2; }

loops_env() {
  cat <<ENV
CHL_HOST=127.0.0.1
CHL_PORT=$PORT
CHL_STATE_DIR=$DATA/state
CHL_UPLOADS_DIR=$DATA/uploads
CHL_SOCKET_PATH=$DATA/run/api.sock
CHL_CONFIG_DIR=$CHECKOUT/config/generic
CHL_PLUGINS_DIR=$CHECKOUT/plugins
CHL_PLUGIN_SECRETS_KEY_FILE=$DATA/plugin-secrets.key
CHL_AGENT_HOME=$HOME
CHL_OWNER_USER_ID=$OWNER
CHL_DISPATCH_INITIAL=gated
CHL_PUBLIC_URL=http://127.0.0.1:$PORT
CHL_ALLOWED_HOSTS=127.0.0.1,localhost
CHL_ALLOWED_ORIGINS=http://127.0.0.1:$PORT,http://localhost:$PORT
CHL_COOKIE_SECURE=false
CHL_WEB_DIR=$CHECKOUT/apps/web/dist
ENV
}

prepare() {
  umask 077
  mkdir -p "$DATA/state" "$DATA/uploads" "$DATA/run"
  chmod 700 "$DATA" "$DATA/run"
  if [ ! -f "$DATA/plugin-secrets.key" ]; then
    head -c 32 /dev/urandom > "$DATA/plugin-secrets.key"
    chmod 400 "$DATA/plugin-secrets.key"
  fi
}

running() {
  [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

case "${1:-status}" in
  env) loops_env ;;
  start)
    if running; then echo "loops-dev: already running, pid $(cat "$PID_FILE"), http://127.0.0.1:$PORT"; exit 0; fi
    prepare
    ( cd "$CHECKOUT/services/api" && set -a && eval "$(loops_env | sed 's/^/export /')" && set +a \
      && nohup uv run python -m crewhub_loops.serve >> "$LOG_FILE" 2>&1 & echo $! > "$PID_FILE" )
    for _ in $(seq 1 40); do
      if curl -s -m 1 -o /dev/null "http://127.0.0.1:$PORT/api/health"; then
        echo "loops-dev: up, pid $(cat "$PID_FILE"), http://127.0.0.1:$PORT, socket $DATA/run/api.sock, log $LOG_FILE"; exit 0
      fi
      sleep 0.5
    done
    echo "loops-dev: did not answer on $PORT within 20 s; see $LOG_FILE" >&2; exit 1 ;;
  stop)
    if running; then kill "$(cat "$PID_FILE")"; rm -f "$PID_FILE"; echo "loops-dev: stopped"; else echo "loops-dev: not running"; fi ;;
  status)
    if running; then echo "loops-dev: running, pid $(cat "$PID_FILE")"; curl -s -m 2 "http://127.0.0.1:$PORT/api/setup/status"; echo; else echo "loops-dev: not running"; fi ;;
  log) tail -n "${2:-40}" "$LOG_FILE" ;;
  setup-token)
    ( cd "$CHECKOUT/services/api" && set -a && eval "$(loops_env | sed 's/^/export /')" && set +a && uv run crewhub-setup-token ) ;;
  *) echo "usage: $0 start|stop|status|log|setup-token|env" >&2; exit 2 ;;
esac
