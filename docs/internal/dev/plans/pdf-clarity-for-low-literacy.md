---
created: 2026-04-17T09:21:35.208Z
updated: 2026-04-17T09:21:35.208Z
---

## Summary

Many users — especially at a grade 8 reading level — don't know what a "PDF" is, how to download one, or how to distinguish it from a screenshot or photo. This plan adds plain-language PDF education to the CreditReportGuide and improves the FileDropzone error messaging to give friendly, specific guidance when users upload the wrong file type.

## Approach

### 1. Add a "What's a PDF?" expandable section to CreditReportGuide

Below the intro text, add a collapsible/expandable section using a simple chevron toggle (no external library needed, just useState):

- **Trigger:** "What's a PDF?" with a small `ChevronDown` icon
- **Expanded content (plain language):**
  - "A PDF is a type of file — like a digital printout. It keeps your report looking the same no matter what device you open it on."
  - "Your credit report should download as a PDF file. The file name will end in **.pdf**"
  - A small visual hint: a styled file icon mockup showing `my-report.pdf` with a red/orange accent bar (pure CSS, no image needed)
  - "If you're not sure, look for the file on your computer — it usually has a red and white icon."

### 2. Add bureau-specific "How to download" step-by-step instructions

In each bureau card, beneath the "Fastest: Online" method, add numbered mini-steps:

**Equifax card:**
1. Go to my.equifax.ca and create a free account
2. Log in and find your credit report
3. Look for a "Download" or "Save as PDF" button
4. Save the file to your computer

**TransUnion card:**
1. Go to ocs.transunion.ca
2. Answer the identity questions to verify who you are
3. Your report (called a "Consumer Disclosure") will appear
4. Look for a "Download PDF" button and save the file

### 3. Improve FileDropzone error messages for wrong file types

Currently, when a user uploads a non-PDF file, the error reads: `Invalid file type. Accepted: .pdf`

Change this to be context-aware and friendlier. In the try-upload page specifically, enhance the error handling:

- **Image file (.jpg, .jpeg, .png, .gif, .webp):** "This looks like a picture, not a PDF file. Please upload the actual PDF you downloaded from Equifax or TransUnion."
- **HTML file (.html, .htm):** "This is a web page file, not a PDF. Go back to the bureau website and look for a 'Download PDF' or 'Save as PDF' button."
- **Word doc (.doc, .docx):** "This is a Word document, not a PDF. Your credit report should be a .pdf file from Equifax or TransUnion."
- **Any other type:** "This file type isn't supported. We need a PDF file (.pdf) — the kind you download from Equifax or TransUnion."

This is best done by:
- Making the FileDropzone's error message customizable via a new optional `errorMessageOverride` callback prop: `(files: File[], errorType: 'type' | 'size' | 'count') => string | undefined`
- The try-upload page passes a callback that returns friendly messages based on file extension
- If the callback returns undefined, fall back to the existing generic message

### 4. Add a "Not sure if you have the right file?" helper below the upload dropzone

On the upload tab of try-upload, below the FileDropzone, add a small helper note:
- "Not sure if you have the right file? It should end in **.pdf** and come from Equifax or TransUnion Canada."
- A link: "Need help getting your report?" that switches to the guide tab.

## Files to Modify

| File | Changes |
|------|---------|
| `components/CreditReportGuide` | Add collapsible "What's a PDF?" section below intro. Add numbered download steps to each bureau card. |
| `components/CreditReportGuide.module.css` | Styles for the expandable section, step lists, and PDF file icon mockup. |
| `components/FileDropzone` | Add optional `errorMessageOverride` callback prop for custom error messages by error type. |
| `pages/try-upload` | Pass `errorMessageOverride` to FileDropzone with friendly messages for common wrong file types. Add "Not sure?" helper text below the dropzone on the upload tab. |

## Files to Create

None.

## Risks & Considerations

- **FileDropzone is shared** — the `errorMessageOverride` prop is optional and backward-compatible. All existing usages will be unaffected.
- **Keep it concise** — the "What's a PDF?" section should be collapsed by default so it doesn't overwhelm users who already know.
- **Mobile-first** — the numbered steps and expandable section must work well on small screens.
- **No images needed** — the PDF file icon mockup uses pure CSS (a small styled box with ".pdf" text and a colored accent), keeping it lightweight.
