#!/usr/bin/env bash
set -euo pipefail

STAGING_HOST="https://staging.creditregulatorpro.com"

check_cmd() {
  local cmd="$1"
  if command -v "$cmd" >/dev/null 2>&1; then
    echo "✅ $cmd is installed"
  else
    echo "❌ $cmd is missing"
    return 1
  fi
}

check_docker() {
  if docker ps -a >/dev/null 2>&1; then
    echo "✅ docker daemon is reachable"
  else
    echo "⚠️ docker is installed but daemon is unavailable/unreachable"
    echo "   Try: sudo systemctl enable --now docker"
    return 1
  fi
}

check_staging_http() {
  if curl -k -I "$STAGING_HOST" >/dev/null 2>&1; then
    echo "✅ staging endpoint reachable via current proxy settings"
    return 0
  fi

  if curl --noproxy '*' -k -I "$STAGING_HOST" >/dev/null 2>&1; then
    echo "✅ staging endpoint reachable directly (bypassing proxy)"
    return 0
  fi

  echo "⚠️ unable to reach $STAGING_HOST (both proxied and direct attempts failed)"
  return 1
}

status=0
check_cmd docker || status=1
check_cmd curl || status=1

if command -v docker >/dev/null 2>&1; then
  check_docker || status=1
fi

if command -v curl >/dev/null 2>&1; then
  check_staging_http || status=1
fi

exit "$status"
