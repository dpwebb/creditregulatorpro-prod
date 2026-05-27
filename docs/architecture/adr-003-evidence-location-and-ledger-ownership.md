# ADR 003: Evidence Location And Ledger Ownership

Status: accepted
Date: 2026-05-27

## Context

Evidence binding is a protected CRP workflow. The platform has two related but separate responsibilities: source-location indexing for canonical report fields and append-only evidence event ledger behavior for packet, delivery, response, audit, and timeline events.

## Decision

`helpers/evidenceLocationIndex.ts` owns source-location indexing. It is the source of truth for reading and resolving stored canonical evidence locations from report artifact data.

`helpers/violationRuleEvidence.ts` owns violation-to-evidence enrichment. It connects scanner findings to deterministic rule evidence, statutory references, evidence IDs, and source-location summaries.

`helpers/evidenceEventLedger.ts` should be treated as the canonical evidence event ledger boundary. New evidence ledger writes should prefer `appendEvidenceEvent` unless a separate approved task documents why direct writes are required.

## Technical Debt

Direct evidence event writes exist today and should be treated as technical debt until migrated through `appendEvidenceEvent` with tests. Future consolidation must preserve behavior for:

- packet PDF cache events
- bureau communication uploads and response classification
- packet delivery and mailing endpoints
- tracking and PostGrid webhooks
- outcome evaluation
- audit and evidence package behavior
- clock/deadline scan behavior

## Future Work Rules

Do not change hash-chain payloads, previous-hash selection, event ordering, packet associations, audit linkage, response classification, PDF cache events, or delivery timeline behavior without targeted tests and separate approval.

