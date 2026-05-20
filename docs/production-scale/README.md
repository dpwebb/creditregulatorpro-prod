# Production-Scale Evidence Framework

This directory tracks the Top 25 production-at-scale blockers from `docs/production-at-scale-maximum-audit.md`.

Run:

```bash
pnpm run production-scale:evidence
```

The command validates `docs/production-scale/blocker-registry.json` against the controlling audit and writes:

- `docs/production-scale/evidence/latest-production-scale-evidence.md`
- `docs/production-scale/evidence/latest-production-scale-evidence.json`

The command is evidence/reporting only. It fails closed in production-like environments, does not mutate production, does not use real consumer PII, and does not connect to live external providers.

## Status Values

- `open`: blocker has no accepted proof yet.
- `partial`: some bounded evidence or implementation exists, but the blocker remains unresolved.
- `fixed`: blocker may be marked fixed only with recognized automated evidence or an explicit human-proof requirement.
- `simulated-proof-only`: only SIMULATED local/staging-safe evidence exists; this is not production proof.
- `staging-proof-only`: staging-safe evidence exists or is required; this is not production proof.
- `requires-human-proof`: a human-observed, sanitized proof artifact is required.
- `waived`: blocker is intentionally waived with explicit governance evidence.

## Evidence Categories

- Automated local evidence is deterministic local command output such as unit/API/contract checks.
- SIMULATED evidence is synthetic, local, or staging-safe and must never be represented as production proof.
- Staging evidence must use synthetic records, bounded workflows, and no live external provider delivery.
- Read-only production evidence must be human-observed, sanitized, and non-mutating.
- Human-observed evidence is required for restore, retention recoverability, and production probe claims that Codex must not perform directly.

Dashboard PASS alone is not release evidence. Dashboard `SKIP` rows remain visible in the generated report and cannot be treated as PASS.
