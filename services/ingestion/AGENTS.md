# Ingestion Service Rules

This subsystem is deterministic-first.

Do not introduce probabilistic AI parsing into canonical extraction paths.

Preserve:
- parser stability
- canonical output shape
- evidence references
- parser regression behavior
- artifact identity and ownership boundaries
- downstream violation and dispute packet inputs

Changes must remain backward compatible unless explicitly approved.

Before changing ingestion service code, identify upstream upload/report-artifact callers and downstream parser, mapping, evidence, violation, and dispute packet consumers.

Every meaningful ingestion change must validate the target behavior, adjacent parser behavior, and no regression in canonical output shape.

If a requested change requires broad ingestion, parser, canonical mapping, evidence, or violation architecture changes, stop and produce an implementation plan and risk analysis before editing code.
