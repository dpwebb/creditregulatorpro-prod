# ADR 002: Compliance Scanner Source Of Truth

Status: accepted
Date: 2026-05-27

## Context

Violation detection and compliance scanning are protected CRP workflows. Several files contain detector logic, scan helpers, UI-facing infraction scans, or rescan behavior. The intended production continuity must remain clear before any cleanup work.

## Decision

`helpers/complianceScanner.tsx` is the canonical scanner owner unless a specific regression test proves another path is intentionally authoritative for a narrower workflow.

Detector modules are subordinate to the canonical scanner flow. They provide individual findings, but canonical scan behavior includes context loading, detector orchestration, deduplication, compliance configuration, admin truth-layer handling, evidence enrichment, local authority filtering, parser confidence handling, and persistence.

## Overlapping Pathways

The following paths appear to overlap with canonical scanner responsibilities and must not be deleted or consolidated without regression tests:

- `helpers/complianceDetectors.tsx`, especially `runAllTradelineDetectors`
- `helpers/regulationInfractionScanner.tsx` and related `regulationInfractionScanner*` files
- `endpoints/tradeline/rescan-compliance_POST.ts`

Future work must first prove that rescan behavior matches canonical scanner behavior for the same tradeline, artifact scope, parser gate, evidence, regulation reference, and persisted finding set.

## Future Work Rules

Do not introduce a second canonical scanner. Do not let UI-only infraction logic become packet-facing truth. Do not replace scanner orchestration with detector manifest-driven execution unless a separate approved task adds equivalence tests for current detector ordering, configuration, admin truth application, persistence, and packet readiness inputs.

