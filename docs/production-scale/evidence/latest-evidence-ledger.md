# Evidence Ledger Remediation Evidence

Generated at: 2026-05-21T05:20:12.2044194Z
Current branch: staging
Current HEAD: 5c1eaef164726a0cf7c3332ad969fb53462a3525
Scope: P0-1 and P2-5 append-only evidence ledger remediation.

CERTIFYING:false

## Summary

The implementation routes general evidence create, correction, retraction, and packet-generated evidence through a centralized append-only ledger helper. Caller-supplied `previousHash` and `currentHash` are no longer accepted by the evidence create schema or UI and are ignored by runtime parsing when submitted as unknown request fields. Evidence update/delete endpoints append correction/retraction events and do not update or delete the original event row.

`CERTIFYING:false` is retained because the exact requested combined Vitest command uses `--runInBand`, which is unsupported by this repo's installed Vitest 4 CLI. The repo-compatible API/unit command and all ledger-focused tests passed.

## Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `git diff --check` | PASS | No whitespace errors. Git emitted CRLF working-copy warnings only. |
| `pnpm exec vitest run tests/api tests/unit --runInBand` | FAIL | Vitest 4 rejected unknown option `--runInBand`; no tests ran under that exact command. |
| `pnpm exec vitest run --config vitest.config.ts tests/api tests/unit` | PASS | 185 test files passed; 1401 tests passed. |
| `pnpm run test:contracts` | PASS | 2 test files passed; 14 tests passed. |
| `pnpm run check` | PASS | Build, golden path, unit, deterministic ingestion, credit regression, tradeline internal, and violation correction checks passed. |
| `pnpm exec vitest run --config vitest.config.ts tests/unit/evidence-event-ledger.spec.ts tests/api/evidence-privacy-endpoint.spec.ts` | PASS | 2 test files passed; 28 tests passed. |
| `pnpm exec vitest run --config vitest.config.ts tests/api/packet-lifecycle-endpoint.spec.ts tests/unit/dispute-packet-template.spec.ts tests/unit/dispute-packet-pdf.spec.ts tests/unit/violation-packet-confidence-gate.spec.ts` | PASS | 4 test files passed; 17 tests passed. |
| `pnpm exec tsc --noEmit --pretty false` | PASS | TypeScript check passed. |

## Automated Evidence Coverage

- Create endpoint ignores caller-supplied hash fields and stores server-computed hashes.
- Stored hashes verify with `helpers/hashChain.tsx`.
- Update endpoint appends `EVIDENCE_EVENT_CORRECTED` and does not call `updateTable("evidenceEvent")`.
- Delete endpoint appends `EVIDENCE_EVENT_RETRACTED` and does not call `deleteFrom("evidenceEvent")`.
- Packet generation writes `PACKET_GENERATED` through the same append-only helper and verifies against persisted event fields.
- Non-owner create/update/delete denial tests remain covered.
- Simulated tampering of a persisted event payload fails `verifyChain`.
- Existing packet generation, packet PDF, packet confidence gate, golden path, and full unit checks passed.

## Non-Certifying Reasons

- The exact requested `--runInBand` validation command is incompatible with the installed Vitest CLI.
- This is local automated evidence only and does not certify live production historical evidence rows.
- Other non-target evidence producers remain outside this bounded patch unless separately remediated.
