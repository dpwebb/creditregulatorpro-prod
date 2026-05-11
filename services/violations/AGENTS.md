# Violation Service Rules

Violation generation must remain deterministic and evidence-bound.

Do not generate speculative violations.

Every violation must:
- map to evidence
- map to regulation
- map to canonical extracted data
- preserve the responsible actor boundary

No AI-generated violation may become active truth without deterministic validation or admin approval.

Preserve:
- violation category stability
- regulation reference stability
- evidence link integrity
- severity and confidence gate behavior
- admin correction approval boundaries
- dispute packet expectations

Changes must remain backward compatible unless explicitly approved.

Before changing violation service code, identify upstream canonical data inputs and downstream admin correction, user workflow, audit, and dispute packet consumers.

If a requested change requires broad violation architecture, new truth-layer behavior, canonical model changes, or regulation mapping changes, stop and produce an implementation plan and risk analysis before editing code.
