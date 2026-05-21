# Latest Ingest Worker Boundary Evidence

Generated at: 2026-05-21T06:35:46.305Z
Current branch: `staging`
Current HEAD: `e15822371ebdb211955beb062035f1955cb387f4`
Working tree clean when generated: no
Status: passed
CERTIFYING: false
Certification reason: This is automated boundary and liveness evidence. It does not claim production queue drain completion without runtime drain evidence.

## Audit Targets

- P1-3 Request-bound immediate ingest processing reintroduces high-cost work into the HTTP path.
- P1-8 Queue state shows critical staleness and no drained-queue proof.
- P2-9 Upload UI communicates queue state, but backend liveness is not guaranteed.

## Static Checks

- PASS process endpoint gates request-bound processing: `shouldAllowRequestBoundIngestProcessing`
- PASS process endpoint only claims inline work behind the gate: `inlineGate.allowed`
- PASS process endpoint preserves durable enqueue path: `enqueueIngestProcessingJob`
- PASS worker preserves lease/claim path: `claimNextIngestProcessingJob`
- PASS worker records heartbeat/liveness: `recordIngestProcessingWorkerHeartbeat`
- PASS worker keeps bounded concurrency gate: `concurrency !== 1`
- PASS queue service exposes worker liveness: `getIngestProcessingWorkerLiveness`
- PASS queue schema persists worker heartbeat: `ingest_processing_worker_heartbeat`
- PASS upload status exposes no-worker heartbeat state: `stalled_no_worker_heartbeat`
- PASS staging compose has ingest worker service: `creditregulatorpro-staging-ingest-worker`
- PASS staging worker service scopes source: `--source authenticated_ingest_process`
- PASS production compose has ingest worker service: `creditregulatorpro-ingest-worker`
- PASS production worker service keeps explicit apply guard: `explicit-bounded-production-ingest-worker-apply`
- PASS staging workflow runs ingest worker boundary preflight: `ingest:worker-boundary-evidence`
- PASS production workflow runs ingest worker boundary preflight: `ingest:worker-boundary-evidence`
- PASS staging workflow starts app and ingest worker services: `creditregulatorpro-staging creditregulatorpro-staging-ingest-worker`
- PASS production workflow starts app and ingest worker services: `creditregulatorpro creditregulatorpro-ingest-worker`

## Commands To Run

- `git diff --check`
- `pnpm exec vitest run tests/api/report-ingest-lifecycle-endpoint.spec.ts tests/unit/ingest-processing-queue-boundary.spec.ts --runInBand`
- `pnpm run test:deterministic-ingestion-report`
- `pnpm run response:soak-check`
- `pnpm run check`

