# Platform Continuity Map

Status: accepted
Date: 2026-05-27

This document records the intended continuity path for the CreditRegulatorPro modular monolith. It is a source-of-truth map for future remediation work only. It does not authorize code consolidation, route rewrites, schema changes, helper deletion, or behavior changes.

## Primary Flow

```text
upload PDF
-> reportArtifact
-> ingest process/worker
-> canonical extractor
-> deterministic parser package
-> persisted tradelines
-> compliance scan
-> evidence location index / rule evidence
-> packet readiness
-> packet record
-> packet PDF / cache / delivery
```

## Continuity Boundaries

1. Upload and artifact storage are owned by `endpoints/ingest/report_POST.ts`, `helpers/ingestReportHandler.tsx`, and `helpers/ingestArtifactCreator.tsx`.
2. Ingest execution is owned by `endpoints/ingest/process_POST.ts`, `scripts/ingest-processing-worker.ts`, and `helpers/ingestCorePipeline.tsx`.
3. Canonical extraction is owned by `helpers/canonicalCreditReportExtractor.tsx`.
4. Deterministic parser package creation is owned by `helpers/deterministicCreditReportPipeline.ts`.
5. Tradeline persistence and matching are owned by `helpers/ingestTradelinePersistence.tsx`.
6. Compliance scan persistence is owned by `helpers/complianceScanner.tsx`.
7. Source-location indexing is owned by `helpers/evidenceLocationIndex.ts`.
8. Violation-to-evidence enrichment is owned by `helpers/violationRuleEvidence.ts`.
9. Packet readiness and packet creation are owned by `helpers/disputePacketService.ts`.
10. Packet PDF content bridging is owned by `helpers/packetPdfContent.ts`, with PDF rendering in `helpers/disputePacketPdf.ts` and caching in `helpers/packetPdfCache.ts`.

## Protected Continuity Rules

Future changes must preserve deterministic ingestion, canonical mapping, evidence binding, compliance scan output, packet readiness gates, generated packet content, PDF/cache behavior, admin access checks, and deletion/reset safety.

Documentation may name technical debt, but documentation alone does not approve consolidation. Any code change in these areas requires targeted regression coverage and a separate approval prompt.

## Do Not Consolidate Without Separate Approval

- legacy DocStrange/diagnostic paths
- regulationInfractionScanner paths
- scanner manifest-driven execution
- readiness rule changes
- schema/cascade changes
- canonical field model changes
- admin truth-layer changes
- user deletion/reset cascade logic
- evidence hash-chain/event-ledger behavior

