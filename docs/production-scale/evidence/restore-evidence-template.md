# Restore Evidence Acceptance Template

Status: Template only. This is not accepted restore proof.

Submit a filled JSON artifact using the same field names. The acceptance script records only sanitized summaries and never performs a dump or restore.

## Required Fields

- evidenceId
- environment: staging or production
- restoreType: dump/restore, backup restore, archive restore, or approved equivalent
- operatorId: initials or opaque operator ID only
- timestamp
- sourceBackupIdentifier
- targetRestoreEnvironment
- measuredRpo.targetMinutes, measuredRpo.actualMinutes, measuredRpo.status
- measuredRto.targetMinutes, measuredRto.actualMinutes, measuredRto.status
- postRestoreChecks.authSession
- postRestoreChecks.packetPdfRetrieval
- postRestoreChecks.responseQueue
- postRestoreChecks.cleanupLifecycle
- postRestoreChecks.rollbackStopVerification
- attestations.noRawReportBytesPrinted
- attestations.noPiiPrinted
- attestations.noSecretsPrinted
- evidenceAttachments under docs/production-scale/evidence/

## JSON Shape

```json
{
  "schemaVersion": 1,
  "templateOnly": true,
  "generatedAt": "2026-05-22T03:20:36.017Z",
  "evidenceId": "REPLACE_WITH_SAFE_EVIDENCE_ID",
  "environment": "production",
  "restoreType": "dump/restore",
  "approvedEquivalentReason": null,
  "humanObserved": true,
  "restoreCompleted": true,
  "operatorId": "OPS1",
  "timestamp": "2026-05-22T00:00:00Z",
  "sourceBackupIdentifier": "sanitized-backup-id",
  "targetRestoreEnvironment": "sanitized-restore-target",
  "measuredRpo": {
    "targetMinutes": 15,
    "actualMinutes": 5,
    "status": "passed"
  },
  "measuredRto": {
    "targetMinutes": 30,
    "actualMinutes": 12,
    "status": "passed"
  },
  "postRestoreChecks": {
    "authSession": {
      "status": "passed",
      "evidenceSummary": "sanitized auth/session lifecycle check summary; no cookies or tokens"
    },
    "packetPdfRetrieval": {
      "status": "passed",
      "evidenceSummary": "sanitized packet PDF retrieval summary; no raw PDF bytes"
    },
    "responseQueue": {
      "status": "passed",
      "evidenceSummary": "sanitized response queue/dead-letter check summary"
    },
    "cleanupLifecycle": {
      "status": "passed",
      "evidenceSummary": "sanitized cleanup and lifecycle verification summary"
    },
    "rollbackStopVerification": {
      "status": "passed",
      "evidenceSummary": "sanitized rollback or stop verification summary"
    }
  },
  "attestations": {
    "noRawReportBytesPrinted": true,
    "noPiiPrinted": true,
    "noSecretsPrinted": true,
    "sanitizedForAudit": true
  },
  "evidenceAttachments": [
    "docs/production-scale/evidence/REPLACE_WITH_SANITIZED_RESTORE_ATTACHMENT.md"
  ]
}
```
