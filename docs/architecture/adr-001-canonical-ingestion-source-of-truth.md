# ADR 001: Canonical Ingestion Source Of Truth

Status: accepted
Date: 2026-05-27

## Context

Credit report ingestion is a protected CRP workflow. It feeds canonical tradeline mapping, compliance scanning, evidence links, readiness validation, and packet generation. The repo still behaves as a modular monolith, but there are legacy and diagnostic extraction paths that can look similar to the canonical path.

## Decision

The canonical ingestion flow is:

```text
upload PDF
-> reportArtifact
-> ingest process/worker
-> canonical extractor
-> deterministic parser package
-> persisted tradelines
-> compliance scan
```

The canonical owner files are:

- `helpers/ingestReportHandler.tsx`
- `helpers/ingestCorePipeline.tsx`
- `helpers/ingestArtifactCreator.tsx`
- `helpers/canonicalCreditReportExtractor.tsx`
- `helpers/deterministicCreditReportPipeline.ts`
- `helpers/ingestTradelinePersistence.tsx`

`helpers/ingestCorePipeline.tsx` is the current orchestration owner for the protected ingest path. It may be large, but it should not be split or bypassed without a separately approved plan and regression coverage.

## Non-Canonical Paths

Legacy DocStrange, LLM-shaped, OCR review, parser lab, source-text backfill, and parser mapping paths are not canonical ingestion unless explicitly invoked by a bounded diagnostic or admin workflow. They must not become authoritative ingestion output unless a separate task adds deterministic tests and explicitly changes this ADR.

## Future Work Rules

Do not change canonical output shape, replay hashes, evidence IDs, source evidence, null-overwrite rules, or persisted tradeline semantics from documentation-only work. Any future consolidation must prove that upload, process/worker execution, deterministic extraction, tradeline persistence, and compliance scan behavior are unchanged.

