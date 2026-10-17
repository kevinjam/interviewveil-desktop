#!/bin/zsh
# Wrap the debug binary in InterviewVeil.app and launch it through Launch
# Services (`open`). Screen Recording TCC follows the *responsible* process.
# `exec` from `cargo`/`npm`/Cursor makes Cursor the responsible process —
# and Cursor is (correctly) denied Screen Recording — so SCK reports
# "user declined TCCs" even when InterviewVeil.app is enabled in Settings.
set -euo pipefail

BIN="${1:?}"
shift

if [[ "$(basename "$BIN")" != "interviewveil" ]]; then
  exec "$BIN" "$@"
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN_ABS="$(cd "$(dirname "$BIN")" && pwd)/$(basename "$BIN")"
APP="$(dirname "$BIN_ABS")/InterviewVeil.app"
MACOS="$APP/Contents/MacOS"
DEST="$MACOS/interviewveil"
ENT="$ROOT/Entitlements.plist"
PLIST="$ROOT/Info.dev.plist"
# `open --stdout` to a path on some volumes (e.g. /Volumes/DevSSD) fails with
# Launch Services -10810. Keep the log on the boot volume.
LOG="${TMPDIR:-/tmp}/interviewveil-dev.log"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"

mkdir -p "$MACOS"

need_sign=0
if [[ ! -f "$APP/Contents/Info.plist" ]] || ! cmp -s "$PLIST" "$APP/Contents/Info.plist"; then
  cp -f "$PLIST" "$APP/Contents/Info.plist"
  need_sign=1
fi
if [[ ! -f "$APP/Contents/PkgInfo" ]]; then
  printf 'APPL????' > "$APP/Contents/PkgInfo"
  need_sign=1
fi
if [[ ! -f "$DEST" ]] || ! cmp -s "$BIN_ABS" "$DEST"; then
  cp -f "$BIN_ABS" "$DEST"
  chmod +x "$DEST"
  need_sign=1
fi

if [[ -f "$ENT" ]] && { [[ "$need_sign" -eq 1 ]] || ! codesign --verify --deep "$APP" >/dev/null 2>&1; }; then
  codesign --force --sign - \
    --identifier com.interviewveil.desktop \
    --entitlements "$ENT" \
    "$APP" >/dev/null 2>&1 || true
fi

if [[ -x "$LSREGISTER" ]]; then
  "$LSREGISTER" -f "$APP" >/dev/null 2>&1 || true
fi

# pgrep -f is a regex against the full command line. Anchor so the unpackaged
# binary is not confused with InterviewVeil.app/Contents/MacOS/interviewveil.
kill_exe() {
  local target="$1"
  local escaped pids
  escaped="$(printf '%s' "$target" | sed 's/[.[\*^$()+?{|]/\\&/g')"
  pids="$(pgrep -f "^${escaped}( |$)" || true)"
  if [[ -n "$pids" ]]; then
    kill ${=pids} 2>/dev/null || true
  fi
}

APP_PID=""
TAIL_PID=""
cleaning=0
cleanup() {
  if [[ "$cleaning" -eq 1 ]]; then
    return
  fi
  cleaning=1
  if [[ -n "$TAIL_PID" ]]; then
    kill "$TAIL_PID" 2>/dev/null || true
  fi
  if [[ -n "$APP_PID" ]]; then
    kill "$APP_PID" 2>/dev/null || true
  fi
  kill_exe "$DEST"
}
trap cleanup EXIT TERM INT HUP

# Drop leftovers from earlier `exec` launches (ppid=1 orphans confuse TCC).
kill_exe "$BIN_ABS"
kill_exe "$DEST"
sleep 0.2

OPEN_ENV=()
while IFS= read -r line; do
  key="${line%%=*}"
  case "$key" in
    TAURI_*|VITE_*|RUST_LOG|RUST_BACKTRACE|HOME|USER|LOGNAME|LANG|TERM|TMPDIR)
      OPEN_ENV+=(--env "$line")
      ;;
  esac
done < <(env)

: > "$LOG"
echo "InterviewVeil: launching $APP via Launch Services (Screen Recording TCC attaches to this .app, not Cursor)"

open_args=(-n --stdout "$LOG" --stderr "$LOG")
if [[ ${#OPEN_ENV[@]} -gt 0 ]]; then
  open_args+=("${OPEN_ENV[@]}")
fi
open_args+=("$APP")
if [[ $# -gt 0 ]]; then
  open_args+=(--args "$@")
fi
open "${open_args[@]}"

escaped_dest="$(printf '%s' "$DEST" | sed 's/[.[\*^$()+?{|]/\\&/g')"
for _ in {1..50}; do
  APP_PID="$(pgrep -n -f "^${escaped_dest}( |$)" || true)"
  if [[ -n "$APP_PID" ]]; then
    break
  fi
  sleep 0.05
done

if [[ -z "$APP_PID" ]]; then
  echo "InterviewVeil: Launch Services did not start $DEST" >&2
  cat "$LOG" >&2 || true
  exit 1
fi

tail -n +1 -F "$LOG" &
TAIL_PID=$!

while kill -0 "$APP_PID" 2>/dev/null; do
  sleep 0.3
done
