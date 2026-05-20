# SIMULATED DRY RUN Alert Evidence

SIMULATED DRY RUN evidence only. No live external alerts were sent, no live external providers were called, and this is not production alert-delivery proof.

Generated at: 2026-05-20T18:38:30.557Z
Branch: `staging`
Commit: `019b1394ef194cbd32aab3ad351618879d49fa70`
Validation: passed

## Required Warning

- SIMULATED alert evidence is not production proof.
- DRY RUN alert payloads are not live email, Slack, webhook, SMS, push, or pager delivery.
- Dashboard PASS alone is not sufficient release evidence.
- Response queue semantics were not changed.

## Alert Categories

- critical_ingest_queue_backlog: CRITICAL (SIMULATED DRY RUN)
  - SIMULATED ingest queue backlog crossed the critical operator threshold.
  - Metric: ingest_queued_jobs=125 threshold=100 jobs
  - Live external call made: no
- dead_letter_response_backlog: CRITICAL (SIMULATED DRY RUN)
  - SIMULATED response-processing dead-letter backlog requires operator review.
  - Metric: response_dead_letter_jobs=3 threshold=1 jobs
  - Live external call made: no
- stale_running_response_job: CRITICAL (SIMULATED DRY RUN)
  - SIMULATED stale-running response job is visible for explicit operator review.
  - Metric: response_stale_running_jobs=1 threshold=1 jobs
  - Live external call made: no
- packet_pdf_cache_warning: WARNING (SIMULATED DRY RUN)
  - SIMULATED packet PDF cache-miss/render warning is capacity evidence only, not a queue fix.
  - Metric: packet_pdf_cache_misses=4 threshold=1 misses
  - Live external call made: no
- storage_raw_report_warning: WARNING (SIMULATED DRY RUN)
  - SIMULATED storage inventory warning indicates possible historical inline raw-report rows.
  - Metric: possible_inline_raw_report_rows=2 threshold=1 rows
  - Live external call made: no
- db_pool_pressure_warning: WARNING (SIMULATED DRY RUN)
  - SIMULATED DB pool pressure signal crossed the warning threshold.
  - Metric: db_active_connection_signal=24 threshold=20 connections
  - Live external call made: no
- restore_evidence_missing_warning: CRITICAL (SIMULATED DRY RUN)
  - SIMULATED restore evidence warning indicates human-observed restore proof remains required.
  - Metric: human_restore_evidence_records=0 threshold=1 records
  - Live external call made: no
- dashboard_skip_warning: WARNING (SIMULATED DRY RUN)
  - SIMULATED dashboard warning states SKIP rows cannot be treated as PASS evidence.
  - Metric: dashboard_skip_rows=12 threshold=1 rows
  - Live external call made: no

## Sanitization

- Payloads sanitized: yes
- Sensitive findings: none
- Raw report data included: no
- PII, secrets, tokens, credential URLs, signed URLs, and signature data included: no

## Safety

- Live external alerts sent: 0
- Live external provider calls made: 0
- Live scheduled daemon enabled: no
- Production data mutated: no
- Synthetic fixtures only: yes
- Parser, OCR, packet wording, storage, packet PDF, retention, deployment activation, and response queue semantics changed: no

## Remaining Blocking Work

- Blocker 8: Partial/SIMULATED evidence only; live scheduler, physical purge/archive, and historical backfill are not proven complete.
- Blocker 9: SIMULATED dry-run/mock alert proof only; live external alert delivery remains disabled.
- Blocker 25: Dry-run includes dashboard skip warning; dashboard reporting must distinguish PASS, FAIL, SKIP, SIMULATED, and HUMAN_REQUIRED.

## Accepted Exclusion Path

If no external alert provider is used, release evidence must explicitly cite the accepted exclusion, this SIMULATED dry-run, operator dashboard coverage, and the human monitoring path. The exclusion must not be described as live external alert proof.
