---
created: 2026-04-09T06:49:49.608Z
updated: 2026-04-09T06:49:49.608Z
---

# Smart Challenge Recommendation in "Write a Letter" Flow

## Summary
When a user clicks "Write a New Letter" from the packets page, they currently see a bare form (pick bureau, pick account, pick reason) with zero guidance on **which account to challenge** or **why**. The backend already has a rich intelligence layer (`strategyFeedback`, `planner/select_POST`, `violationToDisputeVector`, `challengeAccessPointGenerator`) that scores and ranks challenges, but none of it surfaces in the UI.

This plan replaces the cold-start "pick from dropdowns" experience with a **guided recommendation panel** that shows the user which account to challenge, why, and what their best angle is — before they even touch a form field.

---

## Current State
- `CreatePacketDialog` opens with empty dropdowns: Bureau, Account, Status, Dispute Reason
- If opened with `autofillViolationId` (from the compliance hub on a tradeline page), it pre-fills fields and shows a suggested vector — but this path is only reachable from deep in the admin-facing tradeline detail page, not from the main "Write a Letter" button
- The `planner/select_POST` endpoint already computes data-driven recommendations with success rates, creditor/bureau scoring, and rotation logic — but is never called from the packet creation flow
- `creditor-validation/list_GET` returns all compliance violations with severity, confidence scores, and violation categories
- `challengeAccessPointGenerator` provides procedural challenge options when no data violations exist

## Approach

### Step 1: Create a new backend endpoint `packet/recommend_GET`
- Authenticated, user-scoped
- Fetches the user's tradelines with their compliance violations (from `creditorObligationTest`)
- For each tradeline with violations, computes a **challenge score** using:
  - Violation severity (HIGH > MEDIUM > LOW)
  - Confidence score from the compliance scanner
  - Whether it's already been disputed (skip already-exhausted ones)
  - Number of violations on the tradeline (more = higher priority)
- Returns the **top 3 recommended challenges**, each with:
  - `tradelineId`, `tradelineName` (creditor name + last 4 of account)
  - `bureauId`, `bureauName`
  - `violationId` (the specific compliance violation to challenge)
  - `violationCategory` (human-readable)
  - `suggestedDisputeVector` and `suggestedReasonCode`
  - `reasoning` — a plain-language explanation ("This account has a date reporting error. Challenging it has a good chance of success because...")
  - `score` — the composite ranking score
- Also returns `hasViolations: boolean` — if false, the UI shows procedural challenge options instead
- If no violations exist, returns procedural access points from `challengeAccessPointGenerator`

### Step 2: Update `CreatePacketDialog` with a recommendation panel
- When the dialog opens in "manual" mode (no autofill props), show a **recommendation step BEFORE the form**
- This step fetches from `packet/recommend_GET` and displays:
  - A heading: "We recommend challenging this account"
  - Top recommendation card with: creditor name, account snippet, violation description in plain language, and a confidence indicator (e.g., "Good chance of success" / "Worth trying")
  - A "Challenge This Account" button that auto-fills the form
  - Below it, 2 more recommendations as smaller cards ("Other options")
  - A "Skip — I'll choose myself" link to go to the current blank form
- When the user clicks a recommendation, the dialog transitions to the existing form with all fields pre-filled (bureauId, tradelineId, disputeReasonCode, disputeVector)
- If `hasViolations` is false, show procedural access points instead with a message: "We didn't find specific data errors, but here are procedural challenges you can make"

### Step 3: Style the recommendation panel
- Clean card-based layout consistent with the app's design system
- Confidence indicator: green "Good chance" / yellow "Worth trying" / blue "Procedural"
- Mobile-responsive

---

## Files to Create

1. **`endpoints/packet/recommend_GET`** — Backend endpoint that computes and ranks the top challenge recommendations for the user. Queries tradelines + compliance violations, scores them, returns top 3 with reasoning.

## Files to Modify

1. **`components/CreatePacketDialog`** — Add a recommendation step before the form. When opened without autofill props, first show recommendations from `packet/recommend_GET`. User can pick one (auto-fills form) or skip to blank form. When opened WITH autofill props, skip straight to the form as today.

## Risks & Considerations
- **Backward compatibility**: The new endpoint is additive (GET, new route). The `CreatePacketDialog` changes are frontend-only and the existing autofill path is preserved. Fully backward compatible.
- **Performance**: The recommendation endpoint does multiple DB queries. Should keep it lightweight — no LLM calls, just DB aggregation. Target < 1s response.
- **Empty state**: For brand-new users with no tradelines, the recommendation step should show an appropriate message ("Upload a credit report first to get recommendations") and link to `/upload`.
- **Plain language**: All recommendation text must be grade-8 reading level. No legal jargon in the user-facing text.
