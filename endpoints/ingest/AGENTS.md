# Ingest Endpoint Rules

This subsystem is deterministic-first.

Do not introduce probabilistic AI parsing into canonical extraction paths.

Preserve:
- parser stability
- canonical output shape
- evidence references
- parser regression behavior
- authenticated and anonymous upload ownership checks
- ingest progress and error response semantics

Changes must remain backward compatible unless explicitly approved.

Before changing ingest endpoints, identify upstream and downstream effects on:
- report artifacts
- parser and parser mapping logic
- tradeline persistence
- evidence creation
- upload results
- violation detection
- dispute packet inputs

Every meaningful ingest change must validate the target behavior and adjacent parser or artifact flows.

If a requested change requires broad ingestion, parser, evidence, or violation architecture changes, stop and produce an implementation plan and risk analysis before editing code.
