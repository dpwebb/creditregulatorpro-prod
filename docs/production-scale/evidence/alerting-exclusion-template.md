# Alerting Exclusion Template

Submit a sanitized formal exclusion as `docs/production-scale/evidence/alerting-exclusion-evidence.json` when no live external alert provider is used.

Required acceptance terms:

- The exclusion names `L10-P1-005` or observability/alerting blocker scope.
- The exclusion includes the reason, compensating controls, expiration date, next review date, operator approval, and risk acceptance.
- `policyAllowsFormalExclusion` must be true.
- The exclusion explicitly states that it does not mean production-at-scale PASS unless policy allows that limited scope.
- Dry-run alert evidence is acknowledged as not live alert delivery proof.
- Evidence contains no secrets, webhook URLs, PII, signed URLs, raw report data, or service credentials.

Stale exclusions, missing operator approval, and dry-run-only evidence cannot close the alerting blocker.
