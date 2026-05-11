# Admin Violation Correction Rules

The admin correction subsystem is a controlled truth layer.

Do not bypass deterministic validation, evidence binding, auditability, or explicit admin approval.

Every correction must preserve:
- source artifact identity
- run identity
- canonical extracted data boundaries
- evidence references
- regulation references
- deterministic validation status
- audit trail expectations

No admin correction may silently rewrite parser output, canonical models, regulation mappings, or active violation truth outside the explicit correction workflow.

Changes must remain additive and backward compatible unless explicitly approved.

Before changing this subsystem, identify effects on violation generation, evidence packages, regulation registry data, admin workflows, user-facing violation state, and dispute packet generation.

If a requested change requires new truth-layer architecture, schema changes, or broader correction semantics, stop and produce an implementation plan and risk analysis before editing code.
