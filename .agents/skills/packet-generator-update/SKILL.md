---
name: packet-generator-update
description: Use for CreditRegulatorPro dispute packet generator, packet endpoint, packet PDF, packet readiness, packet wording, or packet lifecycle changes where evidence links and consumer-safe wording must remain stable.
---

# Packet Generator Update

1. Read `AGENTS.md`, `helpers/AGENTS.md`, and `endpoints/packet/AGENTS.md`.
2. Before editing, explain upstream violation/evidence inputs, downstream PDF/download/delivery consumers, impact boundary, and tests.
3. Preserve evidence references, selected issue IDs, report artifact IDs, recipient logic, account masking, and manual-review gates.
4. Keep consumer wording neutral. Legal references must be framed as review references, not legal conclusions.
5. Do not create packets for parser-uncertain or unreviewed findings unless an existing readiness gate explicitly allows it.
6. Run:
   - `pnpm run test:golden-path`
   - `pnpm run test:unit -- tests/unit/dispute-packet-template.spec.ts tests/unit/dispute-packet-pdf.spec.ts tests/unit/violation-packet-confidence-gate.spec.ts`
7. Report any packet content version, evidence, PDF, download, or lifecycle behavior changes.
