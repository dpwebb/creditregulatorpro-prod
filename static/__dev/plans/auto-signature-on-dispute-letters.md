---
created: 2026-04-09T07:22:12.674Z
updated: 2026-04-09T07:22:12.674Z
---

# Auto-Generate Mockup Signature on Dispute Letters

## Summary
When a dispute letter (packet) is generated, the system should automatically create a stylized "mockup signature" from the user's name and embed it in the PDF. The signature is a cursive/handwriting-style SVG rendering of the consumer's full name. It is stored in the existing `consumer_signature` table (type `document_signing`) and reused across all future letters for that user.

## Current State
- `consumer_signature` table exists with columns: `id`, `user_id`, `signature_data` (text), `signature_type` (enum including `document_signing`), `metadata` (jsonb), `created_at`, etc.
- `pdfGenerator` already has a `signatureImage` field in `LetterContent` and renders it as `{ image: ..., width: 150, height: 50 }` when present. If absent, it renders blank lines.
- `packetLetterBuilder` builds `LetterContent` but never sets `signatureImage`.
- `packet/create_POST` calls `packetLetterBuilder` → `letterHumanizer` → `generatePDF`. It has access to the user session and user account data.
- pdfmake supports inline SVG via `{ svg: '<svg>...</svg>', width: N }`.

## Files to Create
1. **`helpers/signatureGenerator`** — Backend helper that:
   - Takes a full name string and generates a cursive-style SVG signature.
   - Uses SVG `<text>` with a Google Fonts cursive webfont (e.g., "Dancing Script" or "Great Vibes") embedded as a path, or more practically, uses a set of hand-tuned SVG path templates to create a signature-like look.
   - Simplest robust approach: generate an SVG using a cursive `<text>` element. The SVG text won't embed the font, but we can trace it to paths on the server using basic math, or we can store the SVG and convert it to a base64 PNG using the existing pdfmake font infrastructure.
   - **Recommended approach**: Use pdfmake's own SVG support. Generate an SVG string `<svg><text style="font-family: cursive; font-size: 36px">John Doe</text></svg>` and pass it directly to pdfmake as `{ svg: svgString, width: 150 }` instead of `{ image: ... }`.
   - Also provide a function to check if a user already has a `document_signing` signature, and if not, generate and store one.

## Files to Modify
1. **`helpers/pdfGenerator`** — Update the signature block in the structured letter format:
   - Change from only supporting `signatureImage` (base64 image) to also supporting a new `signatureSvg` field.
   - When `signatureSvg` is present, render `{ svg: signatureSvg, width: 150 }` in the signature area.
   - Keep backward compatibility with existing `signatureImage` field.

2. **`helpers/packetLetterBuilder`** — No direct changes needed here since the signature is applied after letter building.

3. **`endpoints/packet/create_POST`** — After building letter content and before generating the PDF:
   - Query `consumer_signature` for an existing `document_signing` signature for the user.
   - If none exists, call the signature generator to create one, insert it into `consumer_signature`.
   - Set `letterContent.signatureSvg` (or `signatureImage`) with the signature data.

4. **`endpoints/packet/build_POST`** — Same signature logic as create_POST:
   - Query/generate the user's `document_signing` signature.
   - Set it on the `letterContent` before calling `generatePDF`.

## Approach
1. Create `helpers/signatureGenerator` with:
   - `generateSignatureSvg(fullName: string): string` — returns an SVG string with the name rendered in a cursive/handwriting style.
   - `ensureUserSignature(userId: number): Promise<string>` — checks DB for existing `document_signing` signature, generates and stores if missing, returns the SVG string.

2. Update `helpers/pdfGenerator`:
   - Add `signatureSvg?: string` to the `LetterContent` interface.
   - In the signature rendering block, prefer `signatureSvg` (render as `{ svg: ... }`), fall back to `signatureImage`, then fall back to blank lines.

3. Update `endpoints/packet/create_POST`:
   - After `packetLetterBuilder` call, call `ensureUserSignature(user.id)` to get the SVG.
   - Set `letterContent.signatureSvg = svgString`.

4. Update `endpoints/packet/build_POST`:
   - Same as above — call `ensureUserSignature` and set signature on letter content before `generatePDF`.

## Risks & Considerations
- **SVG rendering in pdfmake**: pdfmake's SVG support is limited. If `<text>` elements with cursive fonts don't render well (since the font won't be embedded in the SVG), we may need to generate SVG `<path>` elements instead. A fallback approach is to generate a simple signature using basic line strokes and the consumer name in italic Roboto (which IS embedded in pdfmake).
- **Fallback strategy**: If SVG text rendering is unreliable, use pdfmake's native text rendering with italic/bold Roboto as the signature style (less handwriting-like but guaranteed to work). This would mean using `{ text: consumerName, italics: true, fontSize: 18 }` as the signature block instead of SVG.
- **Backward compatibility**: The `signatureImage` field is preserved. Existing code that may set `signatureImage` (e.g., if users upload real signatures in the future) still works.
- **Performance**: SVG generation is trivial (string concatenation). No external API calls needed.
- **Existing `consumer_signature` records**: The system checks for existing signatures before creating new ones, so it won't duplicate signatures.
- **Mobile app compatibility**: Backend-only changes, fully backward compatible with native app.
