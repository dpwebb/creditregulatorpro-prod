# Formal Alerting Exclusion Template

Use this template only when CreditRegulatorPro will intentionally operate without an external email, Slack, webhook, SMS, push, or pager alert provider for the scoped production window. This is not live alert delivery proof.

Submit the filled, sanitized evidence as either:

- `docs/production-scale/evidence/alerting-exclusion-evidence.md`
- `docs/production-scale/evidence/alerting-exclusion-evidence.json`

Validate with:

```bash
pnpm run alerts:exclusion:validate
```

| Field | Value |
| --- | --- |
| Evidence type | FORMAL_ALERTING_EXCLUSION |
| Operator name or role | TODO |
| Acknowledged at | TODO |
| Environment | TODO |
| Exclusion scope | TODO |
| No external alert provider used | TODO |
| Exclusion reason | TODO |
| Human monitoring cadence | TODO |
| Manual escalation path | TODO |
| Dashboard command | pnpm run operator:dashboard |
| Response soak command | pnpm run response:soak-check |
| Alerts dry-run command | pnpm run alerts:dry-run |
| Alerts dry-run evidence path | docs/production-scale/evidence/latest-alerts-dry-run.json |
| Operator acknowledgement signed | TODO |
| Live alerts sent | false |
| Production data mutated by Codex | false |
| Sanitized evidence statement | TODO |

Required acknowledgement:

The operator must explicitly acknowledge that no external alert provider will be used for the scoped window, that dashboard/soak/manual monitoring is the accepted human monitoring path, and that the exclusion does not prove live external alert delivery.

Do not include PII, raw response text, raw report text, raw PDFs, raw base64, secrets, tokens, signed URLs, database URLs, provider credentials, webhook URLs, cookies, or session values.
