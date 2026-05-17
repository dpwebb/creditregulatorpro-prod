---
created: 2026-04-07T16:35:31.646Z
updated: 2026-04-07T16:35:31.646Z
---

# TransUnion Consumer Disclosure — Step-by-Step User Guide

## Summary

Add clear, easy-to-absorb instructions that walk users through obtaining their free consumer disclosure from TransUnion Canada (via https://ocs.transunion.ca). The content is written at a low-literacy, non-technical level so any Canadian consumer can follow along.

The instructions appear in **two places**:
1. **Upload page** — A collapsible "Don't have your report yet?" help card above the file upload area
2. **Knowledge Base (User Manual → Upload & Reports tab)** — A full dedicated section with all methods (online, mail, phone, in-person)

---

## Pages / Components

### 1. Update `pages/upload` — Add a "Get Your Report" help card

Add a collapsible card **above** the upload drop zone that says:

> **Don't have your credit report yet?**
> Here's how to get a free copy from TransUnion Canada.

When expanded, show a simple numbered walkthrough for the **online method** (fastest):

**Step 1 — Go to TransUnion's website**
Visit [ocs.transunion.ca](https://ocs.transunion.ca/secureocs/#/consumer-disclosure/faq) and click "Request Disclosure."

**Step 2 — Enter your information**
You'll need:
- Your full legal name
- Your date of birth
- Your current home address
- Your previous address (if you moved in the last 2 years)
- Your Social Insurance Number (optional but helps verify you faster)

**Step 3 — Answer security questions**
TransUnion will ask a few questions about your credit history to confirm it's really you. Don't worry — these are multiple choice.

**Step 4 — Download your report**
Once verified, you can view and **download your report as a PDF** right away. Save it to your device.

**Step 5 — Come back here and upload it**
Upload the PDF file you just downloaded. We'll read it and check for problems automatically.

Include a prominent external link button: **"Go to TransUnion Canada →"** that opens `https://ocs.transunion.ca/secureocs/#/consumer-disclosure/faq` in a new tab.

### 2. Update `components/KBUploadReports` — Add a full "How to Get Your Report" section

Add a new `KnowledgeBaseSection` at the **top** of the component (before the existing "Report Upload & Processing Pipeline" section) titled **"How to Get Your Free Credit Report"**.

Content covers all 4 methods with the online method highlighted as recommended:

#### Online (Recommended — Instant)
Same steps as above, with a direct link.

#### By Mail (5–10 business days)
1. Download the Consumer Request form from TransUnion's website
2. Fill it out with your name, address, date of birth, and signature
3. Attach **photocopies** of two pieces of ID:
   - **One primary ID** (driver's licence, Canadian passport, birth certificate, permanent resident card, provincial photo ID, etc.)
   - **One secondary ID** (utility bill with your address, SIN card, T4 slip, CRA Notice of Assessment, etc.)
4. Mail everything to:
   > TransUnion Consumer Relations Dept.
   > P.O. Box 338, LCD1
   > Hamilton, Ontario L8L 7W2
5. Wait for your report to arrive by mail

#### By Phone
1. Call **1-800-663-9980** (toll-free)
2. Answer identity verification questions
3. Your report will be mailed to your home address

#### In Person
Visit a TransUnion provincial office with two pieces of ID.

Include an accordion with **"Accepted ID Documents"** listing primary and secondary categories.

### 3. No new components needed

All additions are inline content within existing components/pages. Use the existing `Accordion`, `KnowledgeBaseSection`, `Collapsible`, and `Badge` components for consistency.

---

## Design Approach

- **Language**: Simple, direct, reassuring. No jargon. Written for someone who has never done this before.
- **Visual**: Use numbered steps with clear icons. The upload page card should use a friendly info-blue color scheme (not warning/error).
- **Mobile-friendly**: All content must be readable on mobile.
- **External link**: The TransUnion link opens in a new tab (`target="_blank" rel="noopener noreferrer"`). Since the app runs in an iframe in dev mode, use `window.open()` as a fallback.

---

## Implementation Steps

1. Update `components/KBUploadReports` — Add the "How to Get Your Free Credit Report" section at the top with all 4 methods and the ID accordion
2. Update `pages/upload` — Add a collapsible help card above the upload area with the quick online walkthrough and external link button
