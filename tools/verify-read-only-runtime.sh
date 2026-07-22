#!/usr/bin/env bash
set -euo pipefail

APPLICATION_ROOT="${WINZARD_APPLICATION_ROOT:-apps/reference}"
PORT="${WINZARD_RUNTIME_SMOKE_PORT:-3100}"
LOG_FILE="$(mktemp -t winzard-runtime-smoke.XXXXXX.log)"
HEADERS_FILE="$(mktemp -t winzard-runtime-smoke.XXXXXX.headers)"
BODY_FILE="$(mktemp -t winzard-runtime-smoke.XXXXXX.body)"
SERVER_PID=''

cleanup() {
  local status=$?
  if [[ -n "${SERVER_PID}" ]]; then
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
  chmod -R u+w "${APPLICATION_ROOT}" 2>/dev/null || true
  if [[ ${status} -ne 0 ]]; then
    printf '%s\n' '--- Next.js read-only runtime log ---' >&2
    cat "${LOG_FILE}" >&2 || true
  fi
  rm -f "${LOG_FILE}" "${HEADERS_FILE}" "${BODY_FILE}"
  exit "${status}"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

test -f "${APPLICATION_ROOT}/.next/BUILD_ID"
mkdir -p "${RUNTIME_WRITABLE_ROOT:?RUNTIME_WRITABLE_ROOT is required}"
chmod -R a-w "${APPLICATION_ROOT}"

START_COMMAND=(
  ./node_modules/.bin/next start "${APPLICATION_ROOT}"
  --hostname 127.0.0.1
  --port "${PORT}"
)

if [[ ${EUID} -eq 0 ]]; then
  command -v setpriv >/dev/null
  APPLICATION_UID="$(stat -c '%u' "${APPLICATION_ROOT}")"
  APPLICATION_GID="$(stat -c '%g' "${APPLICATION_ROOT}")"
  test "${APPLICATION_UID}" != '0'
  RUNTIME_HOME="${RUNTIME_WRITABLE_ROOT}/home"
  mkdir -p "${RUNTIME_HOME}/.cache"
  chown -R "${APPLICATION_UID}:${APPLICATION_GID}" "${RUNTIME_WRITABLE_ROOT}"
  START_COMMAND=(
    setpriv
    --reuid "${APPLICATION_UID}"
    --regid "${APPLICATION_GID}"
    --clear-groups
    --
    env
    HOME="${RUNTIME_HOME}"
    XDG_CACHE_HOME="${RUNTIME_HOME}/.cache"
    USER=winzard
    LOGNAME=winzard
    "${START_COMMAND[@]}"
  )
fi

"${START_COMMAND[@]}" >"${LOG_FILE}" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 60); do
  if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
    printf '%s\n' 'The read-only Next.js process exited before becoming healthy.' >&2
    exit 1
  fi
  if curl --fail --silent \
    --header 'Host: app.example.test' \
    --header 'x-winzard-request-id: spoofed-request-id' \
    --header 'Forwarded: for=203.0.113.10;host=attacker.invalid;proto=https' \
    --header 'X-Forwarded-For: 203.0.113.10' \
    --header 'X-Forwarded-Host: attacker.invalid' \
    --header 'X-Forwarded-Proto: https' \
    --dump-header "${HEADERS_FILE}" \
    --output "${BODY_FILE}" \
    "http://127.0.0.1:${PORT}/api/health/live"; then
    break
  fi
  sleep 1
done

grep -Eq 'HTTP/[0-9.]+ 200' "${HEADERS_FILE}"
tr -d '\r' < "${HEADERS_FILE}" | grep -Eqi '^x-content-type-options: nosniff$'
REQUEST_ID="$(awk 'BEGIN{IGNORECASE=1} /^x-request-id:/ {gsub(/\r/, "", $2); print $2}' "${HEADERS_FILE}" | tail -n1)"
test -n "${REQUEST_ID}"
test "${REQUEST_ID}" != 'spoofed-request-id'
grep -q '"status":"ok"' "${BODY_FILE}"

BAD_HOST_STATUS="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --header 'Host: attacker.invalid' \
  "http://127.0.0.1:${PORT}/api/health/live")"
test "${BAD_HOST_STATUS}" = '400'

printf 'PASS: read-only runtime, trusted Host and internal-header spoofing smoke\n'
