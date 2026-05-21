# Staging Ingest Worker Evidence

Generated at: 2026-05-21T00:20:22.209Z
Evidence type: STAGING_INGEST_WORKER_QUEUE_DRAIN
Status: accepted-staging-queue-drain
Branch: `staging`
Commit: `16ff7ee53f6ec16c1d8db24d4209b699f36a5729`
Environment: staging-safe
Production proof: no

## Required Statements

- STAGING SAFE ONLY.
- Bounded execution was used.
- The ingest worker is not always-on.
- Production worker activation remains deferred unless separately approved.
- Parser and OCR behavior were not changed.
- No production mutation occurred.
- This staging evidence is not production proof.

## Bounded Run

- Command: `pnpm run ingest:worker:staging-evidence`
- Worker command: `pnpm run ingest:worker -- --apply --max-jobs 2 --concurrency 1 --worker-id staging-ingest-evidence --source staging_ingest_evidence_mpeqv8e8`
- Mode: apply
- Max jobs: 2
- Worker exit code: 0

## Queue Drain

- Queue depth before run: 2
- Queue depth after run: 0
- Eligible depth before run: 2
- Eligible depth after run: 0
- Processed count: 2
- Failed count: 0
- Dead-letter count: 0
- Scoped stale queued jobs remaining: no

## Lifecycle Events

- Total lifecycle events: 10
- Claimed events: 2
- Succeeded events: 2
- Retry scheduled events: 0
- Dead-lettered events: 0
- Cleanup attempted events: 0
- Cleanup failed events: 0
- Operator remediation events: 0

## Blocker Coverage

- Blocker 2 staging queue drain: accepted
- Blocker 2 production runtime: not accepted
- Blocker 11 production parity and rollback: not accepted

## Safety

- Production targets used: no
- Production data mutated: no
- Production worker activation deferred: yes
- Parser/OCR/packet/violation/evidence/retention behavior changed: no
- Raw report text or raw PDF base64 included in evidence: no
