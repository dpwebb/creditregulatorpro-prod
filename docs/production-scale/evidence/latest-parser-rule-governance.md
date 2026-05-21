# Parser Rule Governance Evidence

Generated at: 2026-05-21T04:58:17.5921391-03:00

Current HEAD: `fd4db77ece9d8dbc001efe83ff8a0b05c03fc173`

Audit target: P1-6 Parser rule promotion can bypass regression gates while mutating canonical truth.

CERTIFYING:false

Reason: this evidence is automated local simulation, static source verification, and regression proof. It does not claim live production admin workflow certification.

## Implementation Summary

- Patched `endpoints/parser-test-case/promote-rule_POST.ts` so `runRegressionGate:false` is rejected unless `NODE_ENV=test` and `CRP_TEST_ALLOW_PARSER_RULE_REGRESSION_BYPASS=true`.
- Changed promotion order so the endpoint evaluates the proposed rule as a transient parser rule and refuses activation before any active `parserExtractionRule` insert if the regression gate introduces new failures.
- Stored regression evidence with newly promoted rules under `config.__promotionEvidence` while preserving rule semantic matching by ignoring that governance key during active-rule comparisons.
- Added applied parser rule provenance to canonical extraction metadata through `provenance.appliedParserRules`.
- Preserved deterministic parser behavior, parser extraction rule application, admin correction functionality, canonical output shape, and violation-search behavior.

## Automated Evidence

- Production/staging-mode simulation rejects `runRegressionGate:false`.
- A passing regression gate builds an active rule insert with stored regression evidence.
- A failing regression gate throws before active-rule insertion and marks the candidate as failed.
- Canonical extraction provenance can expose applied active rule evidence/version without changing canonical output.
- Parser-rule extraction, parser-test production parser, deterministic ingestion, and full check suites remain green.

## Commands Run

| Command | Result |
| --- | --- |
| `git status --short` | PASS - clean before checkpoint |
| `git add .; git commit -m "checkpoint before codex task"` | PASS - no checkpoint commit created because the working tree was clean |
| `pnpm exec tsc --noEmit --pretty false` | PASS |
| `pnpm exec vitest run --config vitest.config.ts tests/unit/parser-rule-governance.spec.ts tests/unit/parser-extraction-rules.spec.ts tests/unit/parser-rule-promotion-decision.spec.ts tests/unit/parser-test-production-parser.spec.ts` | PASS - 4 files, 15 tests |
| `git diff --check` | PASS - Git reported only LF-to-CRLF working-copy warnings |
| `pnpm exec vitest run tests/api tests/unit --runInBand` | FAIL - Vitest 4.1.5 rejects unsupported option `--runInBand` before tests run |
| `pnpm exec vitest run --config vitest.config.ts tests/api tests/unit` | PASS - 189 files, 1429 tests |
| `pnpm run test:deterministic-ingestion-report` | PASS - 11 fixtures, replay stable, violationSearchPreserved true |
| `pnpm run check` | FAIL - first run hit a Vitest worker-fork unhandled error after unit tests reported pass/skipped |
| `pnpm run test:unit` | PASS - 206 files passed, 1 skipped, 1523 tests passed |
| `pnpm run check` | PASS - build, golden path, unit, deterministic ingestion, credit regression, tradeline internal, and violation-correction checks |

## Residual Risk

- Live admin promotion against the staging database was not manually exercised by design.
- Existing active parser rules that predate this change may not have `__promotionEvidence`; newly promoted rules must carry automated regression evidence.
