# ADR 004: Packet Create/Save Compatibility

Status: accepted
Date: 2026-05-27

## Context

Packet creation, readiness validation, packet content, PDF generation, and delivery are protected CRP workflows. The audit found `_api/packet/create` and `_api/packet/save` currently route to the same core packet creation service.

## Decision

`_api/packet/create` is the canonical packet creation path unless future code inspection and regression tests prove otherwise.

`_api/packet/save` appears to be a compatibility or duplicate route. It must not be removed, renamed, or behaviorally changed without tests proving equivalent behavior for authentication, selected issue IDs, readiness validation, idempotency, persisted packet content, packet findings, evidence events, and client callers.

`helpers/disputePacketService.ts` remains the core packet service for readiness, preview, candidate selection, packet metadata, and packet record creation.

## Readiness Rule

Readiness validation must stay centralized and must not be weakened. Parser uncertainty, missing evidence, manual review requirements, selected issue ownership, packet type constraints, and narrative readiness must continue to gate packet creation and PDF generation.

## Future Work Rules

Any future packet route consolidation must add or preserve tests for `_api/packet/create` and `_api/packet/save`, including duplicate submission/idempotency behavior and blocked readiness behavior.

