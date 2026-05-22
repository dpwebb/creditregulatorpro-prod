# Production Worker Runtime Proof

Generated at: 2026-05-22T03:32:34.309Z
Status: dry-run-only
Accepted: no
Production proof: no
Staging proof: no
Mode: dry-run
Evidence path: `docs/production-scale/evidence/production-worker-runtime-proof-submission.json`
Evidence ID: not submitted
Environment: not submitted
Operator ID: not submitted
Worker ID: not submitted
Source: not submitted
Observed at: not submitted
Evidence age days: not available

## Queue Depth

- Before queued/running/failed/dead-lettered/stale: not submitted
- After queued/running/failed/dead-lettered/stale: not submitted

## Runtime Counts

- Max jobs: 1
- Processed count: 0
- Failed count: 0
- Dead-letter count: 0
- Stale count: 0
- Worker exit code: not submitted

## Stop/Rollback

- Worker liveness observed: no
- Worker liveness status: not submitted
- Rollback/stop verified: no

## Blocker Coverage

- Blocker 2 production ingest runtime: not accepted
- Blocker 11 workflow parity and rollback: not accepted

## Compose Inspection

- Production worker service present: yes
- Production worker restart unless-stopped: yes
- Compose accepted as runtime proof: no

## Validation

- No submitted production worker runtime proof found at docs/production-scale/evidence/production-worker-runtime-proof-submission.json.
- Default dry-run evidence is not accepted as production runtime proof.

## Safety

- This command does not run production apply by default.
- Dry-run, default-off activation, and deferred activation evidence are not production runtime proof.
- Evidence output contains sanitized counts and summaries only.
- Parser truth, ingestion behavior, auth behavior, and queue semantics are unchanged.
