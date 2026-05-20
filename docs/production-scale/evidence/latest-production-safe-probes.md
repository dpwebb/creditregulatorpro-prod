# Latest Production-Safe Probe Evidence

Generated at: 2026-05-20T18:56:33.437Z
Current branch: `staging`
Current commit hash: `63f8615c4d87703fcb113e5a776821fc2fa76302`
Target host: `staging.creditregulatorpro.com`
Plan-only mode: yes

## Required Warnings

- Production runtime probes are read-only `GET`/`HEAD` requests only.
- POST-only cron, webhook, and retired-route rejection checks are static contract evidence and are not executed against production by this gate.
- This evidence does not create production fixtures, mutate production data, activate production workers, or call live external providers.
- Local/staging owner-denial proof is synthetic and is not production mutation proof.
- Dashboard PASS alone is not sufficient release evidence.
- This report does not claim production-at-scale readiness.

## Runtime Read-Only Probe Results

Planned runtime probes:

- app shell: HEAD /; accepted=200; read-only=yes
- login route: GET /login; accepted=200; read-only=yes
- auth session endpoint: GET /_api/auth/session; accepted=401/403; read-only=yes
- admin mock lifecycle endpoint: GET /_api/admin/mock-lifecycle/list?limit=1; accepted=401/403; read-only=yes
- runtime bridge mapping list endpoint: GET /_api/regulation-registry/runtime-bridge/list; accepted=401/403; read-only=yes
- advisory bridge report endpoint: GET /_api/regulation-registry/advisory-bridge/report; accepted=401/403; read-only=yes
- report artifact list endpoint: GET /_api/report-artifact/list?limit=1; accepted=401/403; read-only=yes
- packet list endpoint: GET /_api/packet/list?limit=1; accepted=401/403; read-only=yes
- evidence event list endpoint: GET /_api/evidence/list?limit=1; accepted=401/403; read-only=yes
- response document list endpoint: GET /_api/responses/list?limit=1; accepted=401/403; read-only=yes
- support ticket list endpoint: GET /_api/support-ticket/list?limit=1; accepted=401/403; read-only=yes
- auth session endpoint invalid session: GET /_api/auth/session; accepted=401/403; read-only=yes
- admin mock lifecycle endpoint invalid session: GET /_api/admin/mock-lifecycle/list?limit=1; accepted=401/403; read-only=yes
- runtime bridge mapping list endpoint invalid session: GET /_api/regulation-registry/runtime-bridge/list; accepted=401/403; read-only=yes
- advisory bridge report endpoint invalid session: GET /_api/regulation-registry/advisory-bridge/report; accepted=401/403; read-only=yes
- report artifact list endpoint invalid session: GET /_api/report-artifact/list?limit=1; accepted=401/403; read-only=yes
- packet list endpoint invalid session: GET /_api/packet/list?limit=1; accepted=401/403; read-only=yes
- evidence event list endpoint invalid session: GET /_api/evidence/list?limit=1; accepted=401/403; read-only=yes
- response document list endpoint invalid session: GET /_api/responses/list?limit=1; accepted=401/403; read-only=yes
- support ticket list endpoint invalid session: GET /_api/support-ticket/list?limit=1; accepted=401/403; read-only=yes

- No runtime HTTP probes executed by this plan-only report.

## Static Rejection Contract Evidence

These POST-capable routes are not executed against production by this gate. The evidence verifies fail-closed source contracts.

- missing cron token denial - clock scan: POST /_api/clock/scan (HTTP 401; static-contract-only); status=passed
- invalid cron token denial - clock scan: POST /_api/clock/scan (HTTP 401; static-contract-only); status=passed
- missing cron token denial - regulation scheduled scan: POST /_api/regulation-registry/scheduled-scan (HTTP 401; static-contract-only); status=passed
- invalid cron token denial - regulation scheduled scan: POST /_api/regulation-registry/scheduled-scan (HTTP 401; static-contract-only); status=passed
- missing cron token denial - retention auto purge: POST /_api/retention/auto-purge (HTTP 401; static-contract-only); status=passed
- invalid cron token denial - retention auto purge: POST /_api/retention/auto-purge (HTTP 401; static-contract-only); status=passed
- unsigned PostGrid webhook rejection: POST /_api/webhook/postgrid (HTTP 401/500; static-contract-only); status=passed
- unsigned Stripe webhook rejection: POST /_api/webhook/stripe (HTTP 401; static-contract-only); status=passed
- invalid tracking webhook bearer rejection: POST /_api/webhook/tracking (HTTP 401; static-contract-only); status=passed
- retired public route remains reset - endpoints/admin/letter-template/delete_POST.ts: POST endpoints/admin/letter-template/delete_POST.ts (HTTP 410; static-contract-only); status=passed
- retired public route remains reset - endpoints/admin/letter-template/history_GET.ts: GET endpoints/admin/letter-template/history_GET.ts (HTTP 410; static-contract-only); status=passed
- retired public route remains reset - endpoints/admin/letter-template/humanize_POST.ts: POST endpoints/admin/letter-template/humanize_POST.ts (HTTP 410; static-contract-only); status=passed
- retired public route remains reset - endpoints/admin/letter-template/rollback_POST.ts: POST endpoints/admin/letter-template/rollback_POST.ts (HTTP 410; static-contract-only); status=passed
- retired public route remains reset - endpoints/admin/letter-template/seed_POST.ts: POST endpoints/admin/letter-template/seed_POST.ts (HTTP 410; static-contract-only); status=passed
- retired public route remains reset - endpoints/admin/letter-template_POST.ts: POST endpoints/admin/letter-template_POST.ts (HTTP 410; static-contract-only); status=passed
- retired public route remains reset - endpoints/admin/letter-templates_GET.ts: GET endpoints/admin/letter-templates_GET.ts (HTTP 410; static-contract-only); status=passed

## Safety Summary

- Runtime probes read-only: yes
- Runtime probe plan read-only: yes
- Runtime probe plan methods: `GET`, `HEAD`
- Runtime probe methods: none
- Cron token denial covered by static contract: yes
- Webhook rejection covered by static contract: yes
- Retired public routes covered by static contract: yes
- Unauthenticated sensitive findings: none
- Production data mutated: no
- Production fixtures created: no
- Production worker activated: no
- Live external providers connected: no

