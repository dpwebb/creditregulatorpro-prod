---
created: 2026-05-11T00:00:00.000Z
updated: 2026-05-11T00:00:00.000Z
---

# Dispute Process Redesign Reset

## Purpose
The legacy dispute packet and dispute letter generation stack has been reset. New packet creation must not reuse the retired letter builder, narrative helpers, template editor, vector planner, procedural challenge generator, or escalation loop.

Historical packets, evidence, delivery records, and PDF viewing remain supported so existing user records stay readable.

## Reset Boundary
- New packet creation endpoints return `410 Gone`.
- Legacy admin letter-template endpoints return `410 Gone`.
- Planner and escalation trigger endpoints are disabled or no-op.
- Compliance scans no longer create pending dispute workflow instances.
- Packet delivery records mailing/evidence/deadline history without creating new dispute workflow instances.
- Admin and user UI surfaces show reset states instead of create-letter actions.

## Redesign Principles
- Model the dispute process as explicit stages, not scattered packet side effects.
- Separate recommendation, drafting, review, delivery, response tracking, and escalation.
- Use typed intent objects for dispute goals before composing any letter text.
- Make evidence requirements explicit before drafting.
- Keep letter composition deterministic and inspectable before adding any AI assistance.
- Preserve historical packet records as read-only evidence.

## Phase 3 Next Steps
1. Define the new dispute domain model:
   - `disputeCase`
   - `disputeIssue`
   - `disputeIntent`
   - `disputeDraft`
   - `disputeDelivery`
   - `disputeResponse`
   - `disputeFollowUp`
2. Define state transitions and ownership:
   - detected issue
   - selected issue
   - evidence ready
   - draft ready
   - user reviewed
   - mailed
   - response received
   - follow-up required
   - closed
3. Design a single packet creation service boundary:
   - input validation
   - recommendation selection
   - evidence assembly
   - letter draft composition
   - PDF generation
   - persistence
4. Design the letter composition contract:
   - recipient
   - consumer statement
   - account identifiers
   - dispute facts
   - evidence references
   - requested action
   - certification/signature
5. Add tests before implementation:
   - endpoint reset guards
   - domain transition tests
   - draft composition fixtures
   - PDF rendering smoke tests
   - delivery does not mutate draft state unexpectedly

## Do Not Reintroduce
- `disputeNarrativeBuilder`
- `letterHumanizer`
- `letterTemplateQueries`
- `challengeAccessPointGenerator`
- `violationToDisputeVector`
- `strategyFeedback`
- `vectorRotationAnalytics`
- hidden `obligationInstance` creation from scans or packet delivery
