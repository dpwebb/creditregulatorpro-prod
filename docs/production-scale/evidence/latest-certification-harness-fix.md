# Certification Harness Fix Evidence

Generated: 2026-05-22T19:13:31.262Z
Current HEAD: `9806da4014e26ea9ab3c6311e692287a398f8f37`
Target SHA: `9806da4014e26ea9ab3c6311e692287a398f8f37`
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

- Production-scale certification result: CERTIFYING:false
- Failed gates: restoreMachineProof, productionWorkerMachineProof, alertingMachineProof, retentionArchiveRestoreMachineProof, machineProofSummary, evidenceFreshness
- Stale gates: rollbackShaGovernance, deployRollbackSimulation, restoreMachineProof, productionWorkerMachineProof, alertingMachineProof, retentionArchiveRestoreMachineProof, machineProofSummary
- Skipped gates: none
- Staging-only proof gates: authenticatedUploadResults, authenticatedPacketPdf

## Notes

- Staging auth smokes are staging proof only and are not production runtime proof.
- This artifact does not close production promotion blockers.
- Failing auth smoke command exit codes remain visible in the certification report.
