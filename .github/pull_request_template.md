## Regression Guardrails

- [ ] `pnpm run validate:fast` for ordinary local changes, or `pnpm run validate:changed` for subsystem changes
- [ ] `pnpm run validate:staging` when staging push readiness is required
- [ ] `pnpm run certify:admin` when admin routes, permissions, navigation, rendering, or production-critical admin flows changed
- [ ] Codex review requested or completed for regressions, missing tests, and security issues

## Protected Systems

- [ ] No parser, canonical mapping, evidence binding, violation, regulation, packet, audit, or schema truth changed silently
- [ ] If truth changed: tests updated, version updated, audit/admin review path documented
- [ ] Consumer-facing wording separates legal references from legal conclusions
