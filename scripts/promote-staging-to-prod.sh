#!/usr/bin/env bash
set -Eeuo pipefail

STAGING_DIR="${STAGING_DIR:-/opt/creditregulatorpro-staging/app}"
PROD_DIR="${PROD_DIR:-/opt/creditregulatorpro/app}"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/creditregulatorpro/backups}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-https://creditregulatorpro.com/login}"
DOCKER_COMPOSE_BIN="${DOCKER_COMPOSE_BIN:-docker compose}"
RSYNC_BIN="${RSYNC_BIN:-rsync}"
CURL_BIN="${CURL_BIN:-curl}"
DRY_RUN=0

log() {
  printf '[%s] %s\n' "$(date '+%F %T')" "$*"
}

die() {
  log "ERROR: $*"
  exit 1
}

usage() {
  cat <<'EOF'
Usage:
  promote-staging-to-prod.sh [--dry-run]
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run)
        DRY_RUN=1
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

validate_paths() {
  [[ -d "$STAGING_DIR" ]] || die "Missing staging dir: $STAGING_DIR"
  [[ -d "$PROD_DIR" ]] || die "Missing prod dir: $PROD_DIR"
  [[ -f "$STAGING_DIR/docker-compose.yml" ]] || die "Missing staging docker-compose.yml"
  [[ -f "$PROD_DIR/docker-compose.yml" ]] || die "Missing prod docker-compose.yml"
  [[ -f "$PROD_DIR/.env" ]] || die "Missing prod env: $PROD_DIR/.env"
}

backup_prod() {
  local ts
  ts="$(date +%Y%m%d-%H%M%S)"
  local backup_dir="${BACKUP_ROOT}/prod-${ts}"
  mkdir -p "$backup_dir"
  log "Backing up production to $backup_dir"
  $RSYNC_BIN -a "$PROD_DIR/" "$backup_dir/"
}

sync_staging_to_prod() {
  local -a rsync_args=(
    -a
    --delete
    --itemize-changes
    --exclude '.env'
    --exclude '.env.*'
    --exclude '.git/'
    --exclude '.github/'
    --exclude '.vscode/'
    --exclude 'node_modules/'
    --exclude 'dist/'
    --exclude 'coverage/'
    --exclude '*.log'
    --exclude 'docker-compose.yml'
    --exclude 'docker-compose.override.yml'
    --exclude '*.bak'
  )

  if (( DRY_RUN == 1 )); then
    rsync_args+=(--dry-run)
  fi

  log "Syncing staging to production"
  $RSYNC_BIN "${rsync_args[@]}" "$STAGING_DIR/" "$PROD_DIR/"
}

deploy_prod() {
  cd "$PROD_DIR"
  $DOCKER_COMPOSE_BIN up -d --build
}

healthcheck() {
  log "Checking $HEALTHCHECK_URL"
  curl -k -L -I --max-time 20 "$HEALTHCHECK_URL"
}

main() {
  parse_args "$@"
  validate_paths
  backup_prod
  sync_staging_to_prod

  if (( DRY_RUN == 1 )); then
    log "Dry run complete"
    exit 0
  fi

  deploy_prod
  healthcheck
  log "Promotion complete"
}

main "$@"
