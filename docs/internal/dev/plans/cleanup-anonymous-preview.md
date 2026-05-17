---
created: 2026-04-17T02:16:01.409Z
updated: 2026-04-17T02:16:01.409Z
---

# Cleanup Anonymous Upload Preview

## Summary
Redesign the AnonymousUploadPreview component and its backend data source to present scan results in plain, grade-8-friendly language with clear explanations of what each problem means and why it matters. Remove the cluttered blurred-section/overlay-gate pattern in favor of a clean, scannable card layout.

## Files to Modify

### `endpoints/ingest/anonymous-report_POST.ts`
- Change `sampleProblems` from raw technical strings to structured objects with:
  - `type`: category (e.g. "collection", "pastDue", "derogatory", "publicRecord")
  - `title`: plain-language headline (e.g. "A debt collector is reporting on your file")
  - `detail`: short explanation of what it means (e.g. "NATIONAL LEGAL GROUP says you owe money. This could be wrong or already paid.")
- Keep the same problem detection logic, just produce friendlier output

### `endpoints/ingest/anonymous-report_POST.schema.ts`
- Update `OutputType` to change `sampleProblems` from `string[]` to an array of `{ type: string; title: string; detail: string }`

### `components/AnonymousUploadPreview.tsx` + `.module.css`
- Remove the blurred skeleton items and the absolute-positioned overlay gate box
- Replace with a clean vertical card layout:
  1. **Header**: Shield icon + "We found X potential issues" title + friendly subtitle
  2. **Problem cards**: Each problem is a card with an icon (color-coded by type), a plain-language title, and a 1-line explanation of what it means for the user
  3. **CTA section**: Below the cards, a clear "Unlock Your Full Report" section with the Start Free Trial button — no overlapping, no blurring, just a clean separator
- Use type-specific icons: AlertTriangle for collections, DollarSign for past due, FileWarning for derogatory, Scale for public records
- Each card should have a small colored accent (left border or icon background) based on severity
- Keep mobile responsive — cards stack vertically naturally

### `pages/try-upload.tsx`
- Update the `resultData` state type and the props passed to `AnonymousUploadPreview` to match the new structured format

## Files to Create
None — all changes are modifications to existing files.

## Approach
1. Update the endpoint schema to define the new structured problem type
2. Update the endpoint to generate plain-language titles and details per problem type
3. Redesign the AnonymousUploadPreview component with clean card layout (no blur/overlay)
4. Update try-upload page to pass the new data shape

## Risks & Considerations
- **Backward compatibility**: The `anonymous-report_POST` endpoint output shape changes. Since this is only consumed by the try-upload page (anonymous, unauthenticated), and both frontend + backend deploy together, this is safe. However since this is a native mobile app, we should ensure the old `sampleProblems: string[]` format is also handled gracefully in the frontend (fallback rendering for string items).
- **Plain language**: All problem descriptions must use everyday words — no "derogatory status indicator" or "Metro-2 compliance". Use phrases like "A debt collector says you owe money" or "This account shows a balance that is past due."
