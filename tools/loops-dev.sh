#!/usr/bin/env bash
# A private crewhub-loops for development, next to (never inside) the Mac app: its own checkout, port, data folder
# and Unix socket. Nothing here touches ~/Library/Application Support/be.ekinsol.crewhub, port 8091 or launchd.
#
#   tools/loops-dev.sh start | stop | status | log | setup-token | env
#
# `start` refuses a port that is already served (and says so when the server is ours), and writes the pid file only
# once health answers 200, with the pid of the process that serves the port. `stop` kills that listener (found by the
# port, plus its uv wrapper and whatever the pid file names), waits until the port is free and removes the pid file;
# it never kills a listener that is not crewhub-loops. `status` names the listener's pid. The server started by
# `start` never holds the caller's stdout or stderr (they go to the log, stdin from /dev/null): piping `start` is safe.
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
  # The app writes <data>/settings.json with its port; the world's host finds loops by it (CREWHUB_WORLD_LOOPS_APP_DATA=$DATA).
  printf '{"port": %s}\n' "$PORT" > "$DATA/settings.json"
  if [ ! -f "$DATA/plugin-secrets.key" ]; then
    head -c 32 /dev/urandom > "$DATA/plugin-secrets.key"
    chmod 400 "$DATA/plugin-secrets.key"
  fi
}

# The process that serves the port (the python child of `uv run`, which also serves the socket), found by the port,
# never by the pid file alone: the pid file used to hold the uv wrapper, and killing it left the server running (round 7).
listener() { lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | sort -u | tr '\n' ' ' | sed 's/ $//' || true; } # lsof exits 1 when nothing listens: no failure under pipefail
ours() { # true when pid $1 is a crewhub-loops server (its command names crewhub_loops.serve) or its uv wrapper
  ps -o command= -p "$1" 2>/dev/null | grep -q -E 'crewhub_loops\.serve|uv run'
}
running() { [ -n "$(listener)" ]; }
port_free() { ! running; }

case "${1:-status}" in
  env) loops_env ;;
  start)
    if running; then
      PIDS="$(listener)"
      if ours "${PIDS%% *}"; then echo "loops-dev: already running, listener pid $PIDS, http://127.0.0.1:$PORT"; exit 0; fi
      echo "loops-dev: port $PORT is already served by pid $PIDS, which is not crewhub-loops: refusing to start (stop that process first)" >&2; exit 1
    fi
    prepare
    rm -f "$PID_FILE"
    # The server gets the log as stdout and stderr and /dev/null as stdin, inside a subshell whose own stdio is the
    # same, so nothing it starts holds the caller's pipe (`tools/loops-dev.sh start | cat` returns at once).
    ( exec >> "$LOG_FILE" 2>&1 < /dev/null; cd "$CHECKOUT/services/api" && set -a && eval "$(loops_env | sed 's/^/export /')" && set +a \
      && nohup uv run python -m crewhub_loops.serve & echo $! > "$DATA/run/serve.wrapper.pid" )
    WRAPPER="$(cat "$DATA/run/serve.wrapper.pid")"
    for _ in $(seq 1 40); do
      if curl -s -m 1 -o /dev/null "http://127.0.0.1:$PORT/api/health"; then
        # The pid file is written only now, with the listener (the server itself), never a wrapper that failed.
        LISTENER="$(listener)"; echo "${LISTENER:-$WRAPPER}" > "$PID_FILE"; rm -f "$DATA/run/serve.wrapper.pid"
        echo "loops-dev: up, pid $(cat "$PID_FILE"), http://127.0.0.1:$PORT, socket $DATA/run/api.sock, log $LOG_FILE"; exit 0
      fi
      if ! kill -0 "$WRAPPER" 2>/dev/null; then break; fi
      sleep 0.5
    done
    kill "$WRAPPER" 2>/dev/null || true; rm -f "$DATA/run/serve.wrapper.pid"
    echo "loops-dev: did not answer on $PORT within 20 s (no pid file written); the log ends with:" >&2; tail -n 5 "$LOG_FILE" >&2; exit 1 ;;
  stop)
    PIDS="$(listener)"
    FILED="$( [ -f "$PID_FILE" ] && cat "$PID_FILE" || true )"
    if [ -z "$PIDS" ] && { [ -z "$FILED" ] || ! kill -0 "$FILED" 2>/dev/null; }; then rm -f "$PID_FILE"; echo "loops-dev: not running"; exit 0; fi
    for P in $PIDS; do
      if ! ours "$P" && [ "$P" != "$FILED" ]; then echo "loops-dev: port $PORT is served by pid $P, which is not crewhub-loops: not killed (stop that process yourself)" >&2; exit 1; fi
    done
    # The listener, its uv wrapper (the parent, when it is one) and whatever the pid file names, then wait for the port.
    TARGETS="$PIDS"
    for P in $PIDS; do PARENT="$(ps -o ppid= -p "$P" 2>/dev/null | tr -d ' ')"; [ -n "$PARENT" ] && [ "$PARENT" != 1 ] && ours "$PARENT" && TARGETS="$TARGETS $PARENT"; done
    [ -n "$FILED" ] && kill -0 "$FILED" 2>/dev/null && TARGETS="$TARGETS $FILED"
    kill $TARGETS 2>/dev/null || true
    for _ in $(seq 1 40); do port_free && break; sleep 0.5; done
    if running; then kill -9 $(listener) 2>/dev/null || true; sleep 1; fi
    rm -f "$PID_FILE" "$DATA/run/serve.wrapper.pid"
    if running; then echo "loops-dev: port $PORT is still served by pid $(listener)" >&2; exit 1; fi
    echo "loops-dev: stopped (pids $TARGETS)" ;;
  status)
    if running; then
      echo "loops-dev: running, listener pid $(listener)$( [ -f "$PID_FILE" ] && echo " (pid file: $(cat "$PID_FILE"))" || echo " (no pid file)")"
      curl -s -m 2 "http://127.0.0.1:$PORT/api/setup/status"; echo
    else
      echo "loops-dev: not running$( [ -f "$PID_FILE" ] && echo " (a stale pid file names $(cat "$PID_FILE"))" || true)"
    fi ;;
  log) tail -n "${2:-40}" "$LOG_FILE" ;;
  setup-token)
    ( cd "$CHECKOUT/services/api" && set -a && eval "$(loops_env | sed 's/^/export /')" && set +a && uv run crewhub-setup-token ) ;;
  *) echo "usage: $0 start|stop|status|log|setup-token|env" >&2; exit 2 ;;
esac
