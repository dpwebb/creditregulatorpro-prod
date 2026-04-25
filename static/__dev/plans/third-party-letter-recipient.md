---
created: 2026-04-19T23:09:29.798Z
updated: 2026-04-19T23:09:29.798Z
---

# Third-Party Letter Recipient

## Summary
Allow users to specify a custom third-party recipient (name + full address) when creating dispute letters. Currently, letters can only be sent to credit bureaus. This feature enables users to send letters directly to creditors, collection agencies, or any other third party. The third-party recipient info is stored on the packet record and used throughout the letter generation and delivery pipeline.

## Database Changes

Add 6 nullable columns to the `packet` table:
- `recipient_name` TEXT — third-party org/person name
- `recipient_address_line1` TEXT
- `recipient_address_line2` TEXT
- `recipient_city` TEXT
- `recipient_province` TEXT
- `recipient_postal_code` TEXT

When these fields are populated, they override the bureau-derived recipient. When null, existing bureau-based behavior is unchanged.

## Files to Modify

### 1. endpoints/packet/create_POST (schema + handler)
- **Schema**: Add optional fields: `recipientName`, `recipientAddressLine1`, `recipientAddressLine2`, `recipientCity`, `recipientProvince`, `recipientPostalCode`
- **Handler**: 
  - Relax the `bureauId` requirement: if third-party recipient fields are provided, `bureauId` is optional
  - When third-party fields are present, use them as `recipientName` and `recipientAddress` instead of bureau lookup
  - Store the third-party fields on the packet record
  - Pass them through to `packetLetterBuilder` and `packetDataResolver`

### 2. helpers/packetDataResolver
- Accept optional third-party recipient override params
- When provided, use them for `recipientName` and `recipientAddress` instead of bureau lookup
- Still allow `bureauId` to be null without erroring

### 3. helpers/packetLetterBuilder
- Already accepts `recipientName` and `recipientAddress` — no structural change needed
- The third-party data flows in via the existing params

### 4. endpoints/packet/send-first-class_POST
- When resolving the recipient address (step 6), check for `recipient_name`/`recipient_address_line1` on the packet record first
- If present, build the PostGrid `to` address from these fields instead of bureau lookup
- This is the fallback chain: packet.recipient_* → bureau record → hardcoded bureau address → letterContent recipient

### 5. endpoints/packet/delivery_POST
- No changes needed — it only records delivery metadata, doesn't resolve addresses

### 6. endpoints/packet/save_POST
- **Schema**: Add same optional third-party fields
- **Handler**: Store them on the packet record when provided

### 7. components/CreatePacketDialog
- This file is already flagged as too long — do NOT add more content to it
- Instead, add a small "Custom Recipient" toggle/section in a new sub-component

### 8. NEW: components/ThirdPartyRecipientForm
- A small, reusable form component for entering third-party recipient details
- Fields: Name, Address Line 1, Address Line 2 (optional), City, Province (dropdown of Canadian provinces), Postal Code
- Used inside CreatePacketDialog's form step
- Has a toggle: "Send to a third party instead of the bureau" — when enabled, shows the address form and makes bureauId optional
- Plain language labels (grade 8 level): "Who are you sending this to?", "Their address", etc.

### 9. components/DeliveryWizard
- In the "destination box" (crp-review step), if the packet has `recipient_name` set, display the third-party address instead of the bureau address
- Update the description text to say "creditor" or "third party" instead of "bureau" when applicable

### 10. pages/packets
- When displaying packet cards/list, show the recipient name (third-party name or bureau name) so users can distinguish

## Approach
1. Run SQL to add 6 new columns to the `packet` table, pull schema
2. Update `endpoints/packet/create_POST` schema + handler to accept and store third-party recipient fields, and relax bureauId requirement
3. Update `helpers/packetDataResolver` to accept third-party overrides
4. Update `endpoints/packet/save_POST` to accept and store the fields
5. Update `endpoints/packet/send-first-class_POST` to resolve recipient from packet record first
6. Create `components/ThirdPartyRecipientForm` sub-component
7. Update `components/CreatePacketDialog` to integrate ThirdPartyRecipientForm (minimal change — just import and render)
8. Update `components/DeliveryWizard` destination display to show third-party info
9. Update `pages/packets` list display for third-party recipients

## Risks & Considerations
- **Backward compatibility**: All new fields are nullable, so existing packets are unaffected. bureauId remains required unless third-party fields are provided. No endpoint input/output shapes are broken.
- **PostGrid delivery**: Third-party addresses go through PostGrid the same way — just with a different `to` address. No PostGrid API changes needed.
- **Validation**: Third-party address fields should be validated as a group — if `recipientName` is provided, the core address fields (line1, city, province, postal code) must also be provided.
- **Mobile app compatibility**: Schema additions are additive (new optional fields), so the existing mobile app will continue to work without changes.
