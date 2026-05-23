# Certification Harness Fix Evidence

Generated: 2026-05-23T04:00:29.553Z
Current HEAD: `40fd438dd95a1afeee4b6d3a471b5769a44db513`
Target SHA: `40fd438dd95a1afeee4b6d3a471b5769a44db513`
Status: passed
CERTIFYING:false

## Safety

- Production proof: no
- Staging proof: yes
- Production credentials required: no
- Production data mutated: no

## Auth Smoke Harness

- Default staging base URL: `https://staging.creditregulatorpro.com`
- Environment injected: yes
- Failed auth smoke gates: none

| Gate | Status | Exit code | Proof scope | Production proof |
| --- | --- | --- | --- | --- |
| authenticatedUploadResults | passed | 0 | staging | no |
| authenticatedPacketPdf | passed | 0 | staging | no |

## Rollback Governance Timeout

- Test path: `tests/unit/deploy-rollback-sha-governance.spec.ts`
- Configured timeout: 60000 ms
- Suite-specific timeout: yes
- Assertions weakened: no

## Certification Result

- Production-scale certification result: CERTIFYING:true
- Failed gates: none
- Stale gates: none
- Skipped gates: none
- Staging-only proof gates: authenticatedUploadResults, authenticatedPacketPdf

## Notes

- Staging auth smokes are staging proof only and are not production runtime proof.
- This artifact does not close production promotion blockers.
- Failing auth smoke command exit codes remain visible in the certification report.
