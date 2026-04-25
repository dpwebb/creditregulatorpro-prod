#!/usr/bin/env bash
set -Eeuo pipefail

STAGING_DIR="${STAGING_DIR:-/opt/creditregulatorpro-staging/app}"
PROD_DIR="${PROD_DIR:-/opt/creditregulatorpro/app}"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/creditregulatorpro/backups}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-https://creditregulatorpro.com/login}"
HEALTHCHECK_EXPECT="${HEALTHCHECK_EXPECT:-}"
DRY_RUN=0
SKIP_HEALTHCHECK=0
KEEP_BACKUPS="${KEEP_BACKUPS:-10}"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/prod-${TIMESTAMP}"
ROLLED_BACK=0
RELEASE_LOG="${RELEASE_LOG:-/opt/creditregulatorpro/releases.log}"

log() {
  printf '[%s] %s\n' "$(date '+%F %T')" "$*"
}

die() {
  log "ERROR: $*"
  exit 1
}

write_release_log() {
  mkdir -p "$(dirname "$RELEASE_LOG")"
  printf '[%s] result=%s staging=%s prod=%s backup=%s
' \
    "$(date '+%F %T')" "$1" "$STAGING_DIR" "$PROD_DIR" "$BACKUP_DIR" >> "$RELEASE_LOG"
}

usage() {
  cat <<'EOF'
Usage:
  promote-staging-to-prod-v2.sh [--dry-run] [--skip-healthcheck]
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run)
        DRY_RUN=1
        shift
        ;;
      --skip-healthcheck)
        SKIP_HEALTHCHECK=1
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "Unknown argument: $1"
        ;;
    esac
  done
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing command: $1"
}

validate_paths() {
  [[ -d "$STAGING_DIR" ]] || die "Missing staging dir: $STAGING_DIR"
  [[ -d "$PROD_DIR" ]] || die "Missing prod dir: $PROD_DIR"
  [[ -f "$STAGING_DIR/docker-compose.yml" ]] || die "Missing staging docker-compose.yml"
  [[ -f "$PROD_DIR/docker-compose.yml" ]] || die "Missing prod docker-compose.yml"
  [[ -f "$PROD_DIR/.env" ]] || die "Missing required prod env file: $PROD_DIR/.env"
  [[ "$STAGING_DIR" != "$PROD_DIR" ]] || die "Staging and prod dirs must differ"
}

print_summary() {
  log "Promotion summary"
  log "  staging: $STAGING_DIR"
  log "  prod:    $PROD_DIR"
  log "  backup:  $BACKUP_DIR"
  log "  health:  $HEALTHCHECK_URL"
  log "  dry-run: $DRY_RUN"
}

backup_prod() {
  mkdir -p "$BACKUP_DIR"
  log "Backing up production to $BACKUP_DIR"
  rsync -a --delete "$PROD_DIR/" "$BACKUP_DIR/"
}

prune_old_backups() {
  mkdir -p "$BACKUP_ROOT"

  mapfile -t backups < <(
    find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'prod-*' | sort -r
  )

  if (( ${#backups[@]} <= KEEP_BACKUPS )); then
    return
  fi

  for old_backup in "${backups[@]:$KEEP_BACKUPS}"; do
    log "Removing old backup: $old_backup"
    rm -rf "$old_backup"
  done
}

sync_staging_to_prod() {
  local -a rsync_args=(
    -a
    --delete
    --itemize-changes
    --exclude '.env'
    --exclude '.env.*'
    --exclude 'docker-compose.yml'
    --exclude 'docker-compose.override.yml'
    --exclude '.git/'
    --exclude '.github/'
    --exclude '.vscode/'
    --exclude 'node_modules/'
    --exclude 'dist/'
    --exclude 'coverage/'
    --exclude '*.log'
    --exclude '*.bak'
    --exclude '.DS_Store'
  )

  if (( DRY_RUN == 1 )); then
    rsync_args+=(--dry-run)
  fi

  log "Syncing staging code into production"
  rsync "${rsync_args[@]}" "$STAGING_DIR/" "$PROD_DIR/"
}

deploy_prod() {
  log "Deploying production with prod compose"
  (
    cd "$PROD_DIR"
    docker compose up -d --build
  )
}

healthcheck() {
  if (( SKIP_HEALTHCHECK == 1 )); then
    log "Health check skipped"
    return 0
  fi

  local attempts=20
  local sleep_seconds=5
  local response=""
  local code=""
  local body=""

  log "Checking $HEALTHCHECK_URL"

  for ((i=1; i<=attempts; i++)); do
    set +e
    response="$(curl -k -L -sS --max-time 20 -w $'\n%{http_code}' "$HEALTHCHECK_URL")"
    local curl_status=$?
    set -e

    if (( curl_status == 0 )); then
      code="${response##*$'\n'}"
      body="${response%$'\n'*}"

      if [[ "$code" =~ ^(200|201|202|204|301|302|307|308)$ ]]; then
        if [[ -z "$HEALTHCHECK_EXPECT" || "$body" == *"$HEALTHCHECK_EXPECT"* ]]; then
          log "Health check passed with HTTP $code"
          return 0
        fi
      fi
    fi

    log "Health check attempt $i/$attempts failed; retrying in ${sleep_seconds}s"
    sleep "$sleep_seconds"
  done

  return 1
}

rollback() {
  (( ROLLED_BACK == 1 )) && return 0
  ROLLED_BACK=1

  [[ -d "$BACKUP_DIR" ]] || die "Rollback failed: missing backup $BACKUP_DIR"

  log "Rolling back production from $BACKUP_DIR"
  rsync -a --delete "$BACKUP_DIR/" "$PROD_DIR/"

  (
    cd "$PROD_DIR"
    docker compose up -d --build
  )

  log "Rollback complete"
}

main() {
  parse_args "$@"

  require_cmd docker
  require_cmd rsync
  require_cmd curl

  validate_paths
  print_summary

  if (( DRY_RUN == 1 )); then
    log "Dry run mode: skipping backup and backup pruning"
    sync_staging_to_prod
    log "Dry run complete"
    write_release_log "dry-run"
    exit 0
  fi

  backup_prod
  prune_old_backups
  sync_staging_to_prod

  if ! deploy_prod; then
    log "Deploy failed"
    rollback
    write_release_log "rollback-after-deploy-failure"
    die "Promotion failed during deploy"
  fi

  if ! healthcheck; then
    log "Health check failed"
    rollback
    write_release_log "rollback-after-healthcheck-failure"
    die "Promotion failed health check"
  fi

  log "Promotion complete"
  write_release_log "success"
}

main "$@"
