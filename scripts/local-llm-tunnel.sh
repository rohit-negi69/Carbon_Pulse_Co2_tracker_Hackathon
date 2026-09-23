#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Point the deployed copilot at the Ollama running on this machine.
#
# A deployment cannot reach localhost — on a cloud host, "localhost" is the
# container itself. This opens a free SSH tunnel (localhost.run: no account, no
# install, plain ssh) that forwards a public HTTPS URL to your local Ollama,
# and can hand that URL to the Vercel project as OLLAMA_BASE_URL.
#
#   ./scripts/local-llm-tunnel.sh start    # open the tunnel and print the URL
#   ./scripts/local-llm-tunnel.sh link     # start it, set the Vercel env, redeploy
#   ./scripts/local-llm-tunnel.sh status   # is it up, and on which URL?
#   ./scripts/local-llm-tunnel.sh stop     # close it
#
# Caveats worth knowing:
#   • The tunnel only works while this machine is awake and the tunnel is up.
#     If it drops, the copilot falls back to the rule engine — it never breaks.
#   • A new tunnel can get a new URL, so re-run `link` afterwards.
#   • While it is open, anyone who learns the URL can use your Ollama, cloud
#     models included. Close it when you are done demoing.
# ---------------------------------------------------------------------------
set -euo pipefail

PORT="${OLLAMA_PORT:-11434}"
MODEL="${OLLAMA_MODEL:-gemma4:cloud}"
LOG="${TMPDIR:-/tmp}/carbonpulse-ollama-tunnel.log"
PIDFILE="${TMPDIR:-/tmp}/carbonpulse-ollama-tunnel.pid"

tunnel_url() { grep -oE 'https://[a-z0-9]+\.lhr\.life' "$LOG" 2>/dev/null | head -1 || true; }

is_alive() { [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; }

start() {
  if is_alive && [ -n "$(tunnel_url)" ]; then
    tunnel_url
    return 0
  fi

  curl -sf --max-time 4 "http://localhost:$PORT/api/version" >/dev/null 2>&1 \
    || { echo "error: nothing answering on http://localhost:$PORT — start the Ollama app first" >&2; return 1; }

  : > "$LOG"
  # Spawned detached so the tunnel outlives the shell that started it.
  node -e "
    const { spawn } = require('child_process');
    const fs = require('fs');
    const out = fs.openSync(process.argv[1], 'a');
    const args = [
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', 'ServerAliveInterval=20',
      '-o', 'ServerAliveCountMax=3',
      '-o', 'ExitOnForwardFailure=yes',
      '-R', '80:localhost:' + process.argv[2],
      'nokey@localhost.run',
    ];
    const child = spawn('ssh', args, { detached: true, stdio: ['ignore', out, out] });
    child.unref();
    fs.writeFileSync(process.argv[3], String(child.pid));
  " "$LOG" "$PORT" "$PIDFILE"

  for _ in $(seq 1 40); do
    [ -n "$(tunnel_url)" ] && break
    sleep 1
  done

  local url
  url=$(tunnel_url)
  [ -n "$url" ] || { echo "error: no tunnel URL after 40s — check $LOG" >&2; return 1; }

  if curl -sf --max-time 15 "$url/api/version" >/dev/null 2>&1; then
    echo "$url"
  else
    echo "warning: tunnel opened but Ollama did not answer through it yet ($url)" >&2
    echo "$url"
  fi
}

link() {
  local url
  url=$(start) || return 1
  url=${url##*$'\n'} # keep only the URL if start() emitted a warning too

  # --force overwrites, so re-linking after a dropped tunnel just works.
  printf '%s' "$url/v1" | vercel env add OLLAMA_BASE_URL production --force >/dev/null
  printf '%s' "$MODEL" | vercel env add OLLAMA_MODEL production --force >/dev/null

  echo "linked $url/v1 as OLLAMA_BASE_URL (model: $MODEL)"
  echo "redeploying…"
  vercel --prod --yes >/dev/null 2>&1 || vercel --prod --yes
  echo "done — check /api/health for 'llm: on — ollama (tunnel)'"
}

stop() {
  if is_alive; then
    kill "$(cat "$PIDFILE")" 2>/dev/null || true
    rm -f "$PIDFILE"
    echo "tunnel closed — the copilot falls back to the rule engine"
  else
    pkill -f 'nokey@localhost.run' 2>/dev/null && echo "tunnel closed" || echo "no tunnel was running"
  fi
}

status() {
  if is_alive && [ -n "$(tunnel_url)" ]; then
    echo "up: $(tunnel_url) (pid $(cat "$PIDFILE"))"
  else
    echo "down"
  fi
}

case "${1:-start}" in
  start) start ;;
  link) link ;;
  stop) stop ;;
  status) status ;;
  *) echo "usage: $0 {start|link|status|stop}" >&2; exit 2 ;;
esac
