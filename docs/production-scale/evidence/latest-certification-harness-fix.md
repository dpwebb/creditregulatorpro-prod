# Certification Harness Fix Evidence

Generated: 2026-05-22T17:27:54.936Z
Current HEAD: `5ad7b1dafa990cd0c7b9285797f514da29f4fec5`
Target SHA: `5ad7b1dafa990cd0c7b9285797f514da29f4fec5`
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
- Failed gates: restoreMachineProof, productionWorkerMachineProof, rawReportMachineProof, alertingMachineProof, retentionArchiveRestoreMachineProof, machineProofSummary, evidenceFreshness
- Stale gates: rollbackShaGovernance, deployRollbackSimulation, restoreMachineProof, productionWorkerMachineProof, rawReportMachineProof, alertingMachineProof, retentionArchiveRestoreMachineProof, machineProofSummary
- Skipped gates: none
- Staging-only proof gates: authenticatedUploadResults, authenticatedPacketPdf

## Notes

- Staging auth smokes are staging proof only and are not production runtime proof.
- This artifact does not close production promotion blockers.
- Failing auth smoke command exit codes remain visible in the certification report.
