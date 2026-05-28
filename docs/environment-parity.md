# Environment Parity

Generated at: 2026-05-28T01:56:15.716Z
Commit: `71357daebad930e1b8a7846d73d47d3df9b1de5c`
Status: passed
Operationally aligned: yes

## Summary

- Passing parity checks: 11
- Intentional differences: 4
- Warning differences: 1
- Blocking gaps: 0

## Identical Or Aligned Systems

| Area | Check | Status | Notes |
| --- | --- | --- | --- |
| Docker Compose | App services use the same build context and Dockerfile | PASS | staging="./Dockerfile"; production="./Dockerfile" |
| Docker Compose | App services mount the same durable storage target | PASS | staging=["/app/document-storage"]; production=["/app/document-storage"] |
| Docker Compose | App services use the same host networking and host-gateway shape | PASS | staging={"networkMode":"host","extraHosts":["host.docker.internal:host-gateway"]}; production={"networkMode":"host","extraHosts":["host.docker.internal:host-gateway"]} |
| Docker Compose | Traefik TLS routing model is the same | PASS | staging={"hostRule":"traefik.http.routers.creditregulatorpro-staging.rule=Host(`staging.creditregulatorpro.com`)","servicePort":"3334"}; production={"hostRule":"traefik.http.routers.creditregulatorpro.rule=Host(`creditregulatorpro.com`)","servicePort":"3333"} |
| Runtime | Node and pnpm versions match in deploy workflows | PASS | staging={"node":"22","pnpm":"10"}; production={"node":"22","pnpm":"10"} |
| Runtime | Playwright Chromium is installed in both release-validation paths | PASS | staging=true; production=true |
| Runtime | OCR/PDF tooling is shared through the same Dockerfile | PASS | Shared Dockerfile. |
| Deploy Workflow | Both workflows resolve, validate, and deploy an exact target SHA | PASS | staging="pnpm run validate:staging -- --head \"$VALIDATION_HEAD_SHA\""; production="pnpm run validate:release -- --head \"$VALIDATION_HEAD_SHA\"" |
| Deploy Workflow | Both workflows run storage and worker-boundary preflights before restart | PASS | staging={"storage":true,"workerBoundary":true}; production={"storage":true,"workerBoundary":true} |
| Deploy Workflow | Rollback evidence and post-rollback health checks exist in both workflows | PASS | staging={"evidence":true,"health":true}; production={"evidence":true,"health":true} |
| Health And Smoke | Staging and production use the same read-only public/protected denial smoke model | PASS | staging={"methods":["GET","HEAD"],"protectedDenialPaths":["/_api/auth/session","/_api/evidence/list?limit=1","/_api/packet/list?limit=1","/_api/report-artifact/list?limit=1","/_api/responses/list?limit=1","/_api/support-ticket/list?limit=1"]}; production={"methods":["GET","HEAD"],"protectedDenialPaths":["/_api/auth/session","/_api/evidence/list?limit=1","/_api/packet/list?limit=1","/_api/report-artifact/list?limit=1","/_api/responses/list?limit=1","/_api/support-ticket/list?limit=1"]} |

## Intentionally Different Systems

| Area | Difference | Reason |
| --- | --- | --- |
| Docker Compose | Container names, env files, domains, and app ports intentionally differ | They identify separate environments and must not be homogenized. |
| Health And Smoke | Staging-only destructive or synthetic smokes remain absent from production | Staging may create and clean synthetic fixtures and exercise admin reset dry-run paths. Production release validation must remain read-only. |
| Worker Policy | Production worker remains default-off while staging keeps worker coverage | Production worker activation requires explicit workflow_dispatch guard inputs. Staging keeps continuous worker coverage plus bounded orchestration for E2E certification. |
| Reset Policy | Production reset remains disabled while staging reset validation stays available | Staging reset is admin-protected and disposable-data scoped. Production platform reset must stay unavailable. |

## Risky Differences

| Area | Difference | Risk |
| --- | --- | --- |
| Deploy Workflow | Production host-key pinning is stricter than staging | Production fails closed on host-key pinning. Staging supports host-key pinning but currently retains TOFU fallback so existing staging credentials keep working until STAGING_SSH_HOST_KEY_SHA256 is configured. |

## Eliminated Differences

- Staging release validation now installs Playwright Chromium like production release validation.
- Staging deploy health checks now include production-style read-only protected-route and invalid-session denial probes.
- Storage durability and worker-boundary preflights are verified in both deploy workflows.
- Rollback evidence and post-rollback health checks are statically verified for both deploy workflows.

## Policies

- Worker policy: Production worker is default-off and manual/guarded only. Staging keeps worker coverage for certification and may run bounded staging-safe orchestration.
- Reset policy: Production platform reset remains disabled. Staging reset remains admin-protected and disposable-data scoped.
- Storage policy: Both environments mount /app/document-storage and must pass storage durability preflight before restart.
- Deploy policy: Both environments deploy exact target SHAs through GitHub Actions, capture rollback evidence, and run post-deploy health checks.
- Production-safe probes: Production probes remain GET/HEAD only and must not create fixtures, mutate data, or activate workers.

## Blocking Gaps

None.
