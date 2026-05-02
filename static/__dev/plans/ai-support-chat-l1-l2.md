---
created: 2026-04-19T22:21:47.174Z
updated: 2026-04-19T22:21:47.174Z
---

# AI Support Chat — Level 1 / Level 2 Escalation

## Summary
Add a real-time AI support chat widget accessible from every page of the app. This is the user's first support entry point (Level 1). The AI assistant is preloaded with comprehensive knowledge about Credit Regulator Pro's features, Canadian credit regulations, and platform how-tos. When the AI determines it cannot satisfy the user's query, it automatically escalates to Level 2 by creating a support ticket with the full conversation transcript and emailing Donna (Support Lead) via SendGrid.

## Architecture Overview
- **AI Model**: Gemini 2.5 Flash (free rate limits, fast response)
- **Streaming**: SSE streaming for real-time responses
- **Knowledge**: Static system prompt aggregating platform docs + Canadian credit regulation knowledge
- **Escalation**: AI self-detects when it can't help → creates support ticket + emails Donna
- **Chat Widget**: Floating button on bottom-right, opens a sliding chat panel
- **State**: Conversation maintained in frontend state per session (no DB persistence for L1 chat)

## Files to Create

### `helpers/aiSupportContext.tsx`
Backend-only helper that builds the comprehensive system prompt for the AI support agent. Includes:
- Platform overview (what Credit Regulator Pro does, who it's for)
- Feature guide: Upload reports, tradelines/accounts, compliance checks (35+ rules), dispute letters/packets, evidence management, compliance calendar, deadlines, auto-escalation, analytics/progress
- Navigation guide: Key pages and what they do (/upload, /my-accounts, /packets, /evidence, /calendar, /progress, /my-info, /user-manual)
- Subscription info: Trial User (free for 7 days; internal plan key `beta`), Monthly ($19.95 CAD), Annual ($49.95 CAD)
- Canadian regulation overview: PIPEDA principles (4.3, 4.5, 4.6, 4.6.1), Bankruptcy Act, Metro2 CRRG, provincial CRA acts
- The 45 violation categories with plain-language labels (from getViolationLabel)
- Common user tasks: how to upload a report, how to view violations, how to create a dispute letter, how to track deadlines, how to manage your profile/billing
- Tone instructions: Grade 8 reading level, encouraging, plain language, short sentences
- Escalation instructions: If the user's question is about billing disputes, account-specific technical issues, legal advice, or anything the AI is unsure about → respond with a special JSON marker `{"escalate": true, "reason": "..."}` appended after the user-facing message

### `endpoints/support/ai-chat_POST.ts` + `.schema.ts`
Streaming SSE endpoint that:
1. Authenticates the user via `getServerUserSession`
2. Accepts `{ messages: Array<{role: "user"|"assistant", content: string}>, escalate?: boolean }`
3. If `escalate` is true: create a support ticket with the conversation transcript, email Donna, return a confirmation message
4. Otherwise: calls Gemini 2.5 Flash streaming API with the system prompt from `aiSupportContext` + conversation history
5. Streams the response back as SSE events: `{type: "chunk", content: "..."}`, `{type: "done"}`, or `{type: "escalated", ticketId: number}`
6. After streaming completes, parses the full response for the `{"escalate": true}` JSON marker. If found, automatically creates a support ticket and emails Donna, then sends an `{type: "escalated", ticketId: number}` event

Donna's email should be configurable — store it in system_settings or hardcode initially as a constant. The email includes:
- Subject: "Level 2 Support Escalation — [User Name]"
- Body: User info, escalation reason, full conversation transcript, link to the support ticket

### `helpers/useAISupportChat.tsx`
Frontend React hook managing the entire chat lifecycle:
- `messages` state: Array of `{role, content, isEscalated?}` 
- `sendMessage(text)`: Appends user message, calls the streaming endpoint, processes SSE chunks to build the assistant response in real-time
- `isStreaming` state for loading UI
- `escalationTicketId` state — set when escalation happens
- `resetChat()` to start a new conversation
- Handles SSE parsing via `EventSource` pattern or manual fetch + ReadableStream reader
- On escalation event, updates UI to show the ticket was created

### `components/AISupportChat.tsx` + `.module.css`
A floating chat widget with two states:

**Collapsed state**: A round floating action button (bottom-right corner, above any existing FABs) with a chat/headset icon and a subtle pulse animation. Tooltip: "Need Help? Chat with us"

**Expanded state**: A slide-up chat panel (~400px wide, ~550px tall on desktop, full-width on mobile) containing:
- **Header**: "Support Chat" title, Badge showing "AI Powered", minimize button (X)
- **Message area**: Scrollable list of messages. User messages aligned right (primary color bg), AI messages aligned left (card bg). Show typing indicator (animated dots) while streaming.
- **Escalation banner**: When escalated, show a green success card: "We've created a support ticket (#123) and notified our team lead Donna. She'll follow up with you by email. You can also track your ticket in My Info → Support."
- **Input area**: Text input + send button. Disabled while streaming. Placeholder: "Ask me anything about the app..."
- **Quick suggestions**: On first open (no messages yet), show 4 clickable suggestion chips: "How do I upload my credit report?", "What violations did you find?", "How do I send a dispute letter?", "I need to talk to a real person"

Styling: Follow the existing app design system. The chat panel should have a subtle backdrop blur, card background, and proper z-index to float above page content.

## Files to Modify

### `components/AppLayout.tsx`
- Import and render `<AISupportChat />` at the bottom of the layout, after the main content area
- Only show for authenticated users (not on login/register pages — AppLayout already handles this)

## Approach
1. Create `helpers/aiSupportContext` with the comprehensive system prompt
2. Create `endpoints/support/ai-chat_POST` streaming endpoint with Gemini integration and escalation logic
3. Create `helpers/useAISupportChat` hook for frontend state management
4. Create `components/AISupportChat` floating widget UI
5. Update `components/AppLayout` to include the chat widget
6. All in one coordinated implementation

## Risks & Considerations
- **Gemini rate limits**: Using 2.5 Flash free tier. If heavy usage, may need to upgrade or add rate limiting per user.
- **System prompt size**: The knowledge context is large but Gemini handles long contexts well. Keep it focused on what users actually ask about.
- **Escalation reliability**: The AI's self-detection of "I can't help" isn't perfect. Also offer a manual "Talk to a real person" button that forces escalation.
- **Email delivery**: Depends on SendGrid being configured. The escalation still creates a ticket even if the email fails (fire-and-forget pattern matching existing notification code).
- **Donna's email**: Needs to be configured. Could use system_settings or a hardcoded constant initially. Should ask user for Donna's email.
- **Mobile app compatibility**: This is frontend + one new endpoint. No breaking backend changes. The floating widget works well on mobile with full-width expanded state.
- **No conversation persistence**: L1 chats are ephemeral (session-only). The full transcript is saved in the support ticket if escalated, so nothing is lost.
