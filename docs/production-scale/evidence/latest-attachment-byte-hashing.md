# Attachment Byte Hashing Evidence

Generated at: 2026-05-21T07:19:58.7280376-03:00
Current branch: staging
Current commit hash: 8b771d002261f3d60e898092807f1e3077e9ef04
Scope: P2-3 bureau communication attachment hashes must bind to decoded bytes, not base64 text.
CERTIFYING:false

## Implementation Boundary
- Patched `endpoints/evidence/bureau-communication_POST.ts` only in the bureau communication upload hash boundary.
- Preserved existing evidence upload, storage helper, evidence attachment retrieval, response classification, obligation update, packet update, and transaction flow.
- Replaced caller payload text hashing with decoded-byte SHA-256 using `helpers/reportBinaryUtils.tsx`.
- Preserved raw base64 and data URL input compatibility.
- Stored MIME metadata through the existing `evidenceAttachment.fileType` field and stored decoded-byte digest metadata in the audit details.

## Automated Evidence
- Same binary with different base64 line wrapping produces the same `fileHash`.
- Raw base64 and data URL base64 for the same bytes produce the same `fileHash`.
- Invalid bureau communication base64 still fails before ownership, storage, hashing, or transaction work.
- Existing bounded bureau communication persistence still stores through the existing attachment path and does not return inline base64.
- Evidence ledger API/unit tests remained green under the repo-supported Vitest command.

## Commands Run
| Command | Result | Notes |
| --- | --- | --- |
| `pnpm exec vitest run --config vitest.config.ts tests/api/evidence-privacy-endpoint.spec.ts` | PASS | 1 file, 27 tests passed. |
| `git diff --check` | PASS | No whitespace errors. |
| `pnpm exec vitest run tests/unit tests/api --runInBand` | FAIL | Vitest 4.1.5 rejects `--runInBand` before tests execute. |
| `pnpm exec vitest run --config vitest.config.ts tests/unit tests/api` | PASS | 192 files, 1460 tests passed. |
| `pnpm run check` | PASS | Build, golden path, unit suite, deterministic ingestion report, credit parser regression, tradeline internal checks, and violation correction regression passed. |

## Result
The functional byte-hashing evidence is automated and passing. This evidence file remains `CERTIFYING:false` because the exact requested `--runInBand` validation command fails at CLI parsing in the installed Vitest version, even though the repo-supported equivalent test scope passes.
