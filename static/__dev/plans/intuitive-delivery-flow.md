---
created: 2026-04-07T05:34:16.633Z
updated: 2026-04-07T05:34:16.633Z
---

# Intuitive Delivery Flow Redesign

## Summary
Redesign the packet delivery experience so that the choice between "XAPP sends it for you" vs. "I'll print and mail it myself" is presented **immediately after a packet is created/saved**, using plain language, large visual cards, and a guided step-by-step flow — not buried in a popover inside a dialog. The target audience may have limited literacy, so every label, instruction, and button must use the simplest possible wording and rely heavily on icons and visual cues.

## Design Principles (Low-Literacy Audience)
- **Short sentences, grade-5 reading level.** No jargon ("evidentiary weight" → "proof of delivery").
- **One decision per screen.** Never show two unrelated choices at once.
- **Big tap targets.** Cards and buttons must be large enough for confident tapping on mobile.
- **Icons tell the story.** Every option gets an illustrative icon so users can understand at a glance.
- **Progress breadcrumbs.** A simple 3-step indicator (Choose → Confirm → Done) so users always know where they are.
- **"Pending" status for self-mail.** If the user chooses to mail it themselves, the packet gets a visible "Waiting for you to mail" status so they can return later to record the tracking number.

## Current Flow (What's Wrong)
1. User generates a packet → PacketViewer dialog opens (PDF preview)
2. User must find and click a small "Record Delivery" button in the dialog header
3. A **400px popover** opens with 4 options in 2 categories, checkboxes, date pickers, and payment triggers all crammed together
4. If user picks "self-send", they must download, leave, mail at the post office, return to the app, find the packet again, re-open the viewer, click "Record Delivery" again, and fill in tracking

## New Flow (Hybrid)

### Step 1 — "What do you want to do next?" (right after saving)
After a packet is saved (either from PacketViewer save action or after CreatePacketDialog auto-save), instead of returning to the PDF viewer, present a **full-width SendMethodPicker** component (replaces the popover). This is the fork:

| Card | Icon | Heading | Subtext |
|------|------|---------|---------|
| 🟢 **We Send It** | ✉️ Mail truck | "Let us mail it for you" | "We print, sign, and mail your letter. You don't have to do anything else." |
| 🔵 **I'll Send It** | 🖨️ Printer | "I'll print and mail it myself" | "Download your letter, print it, and take it to the post office." |

- Both cards are large (at least 120px tall), with the icon on the left and text on the right.
- Tapping a card advances to Step 2 for that path.

### Step 2a — XAPP Service Path ("We Send It")
A **SendViaXappFlow** sub-step:
1. Show a simple summary: "We will print and mail your letter to [Bureau Name]."
2. Show cost clearly: "$X.XX" with the label "This is what it costs."
3. If no signature on file → show a friendly nudge: "We need your signature first" with a button to profile settings.
4. Two checkboxes (simplified):
   - ☐ "I checked this letter and it looks right."
   - ☐ "Everything in this letter is true."
5. **"Pay & Send"** button (large, primary).
6. On click → StripePaymentDialog → on success → Step 3 (Done).

Only First Class is currently available. Registered Mail remains "Coming Soon" — shown as a disabled card below the primary option with a badge.

### Step 2b — Self-Mail Path ("I'll Send It")
A **SelfMailFlow** sub-step:
1. Big "Download Your Letter" button (primary, full-width) — downloads the PDF.
2. Below, a simple checklist of what to do next (read-only, not interactive):
   - 📄 Print the letter
   - ✍️ Sign it
   - 📬 Mail it at the post office
   - 🔢 Save your tracking number (if registered mail)
3. Two sub-options presented as a simple toggle or radio:
   - **Regular Mail** — "Cheaper, but no tracking number"
   - **Registered Mail** — "Costs more, but you get a tracking number as proof" (recommended badge)
4. "I Already Mailed It" button → expands a small inline form:
   - Mail type (pre-selected from toggle above)
   - Tracking number (only if Registered)
   - Date sent (defaults to today)
   - Two checkboxes (same simplified language as 2a)
   - "Save" button
5. "I'll Do This Later" button → sets packet status to **"Ready to Mail"** and closes the flow with a toast: "No problem! You can record your mailing info anytime from the Packets page."

### Step 3 — Done
A simple confirmation screen:
- ✅ Large green checkmark icon
- "Your letter has been sent!" (XAPP) or "Your mailing info has been saved!" (self)
- "What happens next" — one or two sentences about expected timelines
- "Go to Packets" button

### Returning to Record Self-Mail Later
- On the Packets list page, packets with status "Ready to Mail" show a prominent **"Record Mailing"** badge/button in the actions column.
- Clicking it opens the **SelfMailFlow** (Step 2b) directly — no need to open the full PacketViewer first.
- On the tradeline detail page, the TradelinePacketGenerationCard also shows "Ready to Mail" status with a direct action button.

## Files to Create

### `components/DeliveryWizard`
The main orchestrator component. Manages a 3-step state machine (choose → confirm → done). Renders the appropriate sub-step based on state. Shown as a Dialog (large, not a popover).

Props:
- `packetId: number`
- `bureauName: string`
- `open: boolean`
- `onOpenChange: (open: boolean) => void`
- `onComplete?: () => void`
- `onDownloadPdf?: () => void`
- `initialStep?: 'choose' | 'xapp' | 'self'` — allows opening directly to Step 2b for "Record Mailing" return flow

Internal sub-views (all within the same component file to keep it simple):
- **StepChoose** — the two big cards
- **StepXapp** — XAPP send flow with payment
- **StepSelf** — self-mail flow with download + record form
- **StepDone** — confirmation

## Files to Modify

### `components/PacketViewer`
- After a packet is saved (either via "Save Packet" or after preview auto-save), instead of staying on the PDF view, trigger the `DeliveryWizard`.
- Remove the "Record Delivery" Popover trigger. Replace with a simpler "Send This Letter" button that opens the `DeliveryWizard` dialog.
- Keep the existing Download and Print buttons in the header (they're useful for quick access).
- When packet status is "Ready to Mail", show a "Record Mailing" button that opens `DeliveryWizard` at the self-mail step.

### `components/PacketDeliveryForm`
- Keep this component as-is for now (backward compatibility), but it will no longer be rendered inside PacketViewer. It may still be used if other parts of the system reference it. Verify references first — if only PacketViewer uses it, we can deprecate it later.

### `components/TradelinePacketGenerationCard`
- When the existing packet has status "Ready to Mail", show a "Record Mailing" action button alongside "View Dispute Packet".

### `pages/packets`
- In the table, add visual treatment for "Ready to Mail" status: a distinct badge variant (e.g., `warning` or a custom "action-needed" style).
- Add a "Record Mailing" quick-action button in the actions column for packets with "Ready to Mail" status. This opens the `DeliveryWizard` directly at Step 2b.

### `endpoints/packet/delivery_POST` (or schema)
- Ensure the endpoint accepts a new status value "Ready to Mail" for packets that the user has downloaded but not yet mailed. This should be a no-op status update (just mark the packet, no evidence event yet).

### `endpoints/packet/save_POST` (or the relevant save endpoint)
- When saving a packet, if no delivery has been recorded, default the status to "Draft" as today. The "Ready to Mail" transition happens when the user explicitly chooses "I'll Send It" in the wizard.

## Files to Delete
None — all changes are additive.

## Approach

### Phase 1: Backend (status support)
1. Verify the `packet` table's `status` column accepts "Ready to Mail" as a value. If it's an enum, add the new value. If it's a varchar, no change needed.
2. Update `packet/delivery_POST` endpoint to support marking a packet as "Ready to Mail" without requiring tracking number or sent date.

### Phase 2: DeliveryWizard component
3. Create `components/DeliveryWizard` with the full step-by-step flow.
4. Wire up existing hooks (`usePacketDelivery`, `useSendFirstClass`, `usePostgridDelivery`) inside the wizard.
5. Reuse `StripePaymentDialog` for the payment step.

### Phase 3: Integration
6. Update `PacketViewer` to trigger the wizard after save and replace the popover.
7. Update `TradelinePacketGenerationCard` for "Ready to Mail" status.
8. Update `pages/packets` for "Ready to Mail" badge and quick action.

### Phase 4: Polish
9. Ensure mobile responsiveness (cards stack vertically, large tap targets).
10. Test the return flow (packets page → Record Mailing → DeliveryWizard Step 2b).

## Risks & Considerations

- **Backward compatibility**: The `PacketDeliveryForm` component is currently only referenced by `PacketViewer`. We replace the integration point but keep the component file to avoid breaking anything.
- **Mobile app**: This project is deployed as a native mobile app. All backend changes are additive (new status value, no endpoint signature changes). Frontend changes are purely visual/flow improvements.
- **Status enum**: If `packet.status` is a Postgres enum, we'll need a migration to add "Ready to Mail". If varchar, no DB change needed.
- **Stripe Payment Dialog**: Already exists and works — we just reuse it inside the wizard instead of inside PacketDeliveryForm.
- **Signature check**: The wizard reuses the existing signature query from PacketDeliveryForm.
- **No websockets**: The wizard is a client-side state machine, no real-time features needed.
