# Packet Duplicate Policy

CreditRegulatorPro uses Option A: idempotent packet creation.

For the same owner, same selected finding set, same packet type, same tradeline, and same bureau/report context, repeated packet creation returns the existing completed packet record instead of creating another packet.

## Scope

This policy applies after normal packet readiness and authorization checks pass. It does not bypass:

- finding ownership checks
- admin/non-admin access boundaries
- parser confidence and user-review readiness gates
- evidence requirements
- recipient bureau matching
- same-tradeline and same-owner selection rules

The build and readiness endpoints remain preview/validation surfaces. The create and save endpoints enforce idempotent persistence.

## Response Metadata

Packet create/save responses include:

- `duplicatePolicy: "created_new"` when a new packet was inserted
- `duplicatePolicy: "idempotent_reuse"` when an existing packet was returned
- `reusedExistingPacket: true` on reuse
- `existingPacketId` on reuse

The reused packet remains downloadable through the existing packet PDF endpoint.

## Audit Behavior

The original packet creation writes the existing `PACKET_GENERATED` audit and evidence events. A repeated idempotent create writes a `READ` audit log with `packetDuplicatePolicy: "idempotent_reuse"` and does not create new packet, evidence-event, or packet-finding rows.

## Existing Historical Duplicates

This policy prevents new ambiguous duplicates. Existing historical duplicate packets are not automatically merged or deleted because they may already have downloads, delivery state, responses, evidence attachments, or audit history. Any cleanup should be a separate admin-reviewed reconciliation task.
