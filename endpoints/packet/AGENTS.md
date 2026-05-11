# Packet Endpoint Rules

Dispute packet endpoints are protected.

Before changing this directory, explain effects on:
- violation readiness gates
- evidence references
- packet content
- PDF generation/download
- delivery status and auditability
- user and admin workflows

Do not silently change packet truth, recipient logic, evidence references, legal wording, or download behavior. Any truth-affecting change needs tests, a version/update marker, audit or review trail, and an admin review path when needed.

Run at minimum:
- `pnpm run test:golden-path`
- `pnpm run test:unit -- tests/unit/dispute-packet-template.spec.ts tests/unit/dispute-packet-pdf.spec.ts`
