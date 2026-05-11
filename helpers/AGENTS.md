# Core Platform Helper Rules

This directory contains shared platform-critical logic for ingestion, parsing, canonical mapping, evidence, violations, regulation references, dispute packets, and admin correction.

When editing helper files related to those systems, treat them as deterministic-first and regression-sensitive.

Preserve:
- canonical output shapes
- parser regression behavior
- deterministic parser and mapping behavior
- evidence references
- violation-to-evidence links
- violation-to-regulation links
- dispute packet inputs and outputs
- audit logging expectations
- admin correction truth boundaries

Do not:
- introduce probabilistic AI logic into deterministic canonical paths
- create speculative violations
- silently change schemas or canonical models
- duplicate parser, evidence, violation, regulation, or dispute services
- alter parser logic outside parser tasks
- alter violation logic outside violation tasks
- alter dispute packet logic outside dispute tasks

Every violation produced by helper logic must map to evidence, regulation, and canonical extracted data.

No AI-generated finding, mapping, or violation may become active truth without deterministic validation or admin approval.

Before making helper changes, identify the upstream callers, downstream consumers, impact boundary, protected systems, and regression tests that cover the behavior.

If a requested change requires broad architecture changes, stop and produce an implementation plan and risk analysis before editing code.
