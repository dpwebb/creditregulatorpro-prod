import { describe, expect, it } from "vitest";

import { buildEvidenceEventHashPayload } from "../../helpers/evidenceEventLedger";
import { chain, verifyChain } from "../../helpers/hashChain";

describe("append-only evidence event ledger helpers", () => {
  it("builds hash-chain entries from persisted evidence event fields", () => {
    const first = {
      packetId: 101,
      eventType: "PACKET_GENERATED",
      description: "Synthetic packet generated.",
      statuteVersionId: null,
      organizationId: 55,
      region: "CA",
      at: "2026-05-21T00:00:00.000Z",
      previousHash: "GENESIS",
    };
    const firstPayload = buildEvidenceEventHashPayload(first);
    const firstHash = chain(first.previousHash, firstPayload);
    const second = {
      packetId: 101,
      eventType: "EVIDENCE_EVENT_CORRECTED",
      description: "Correction for evidence event #1: description: Synthetic correction.",
      statuteVersionId: null,
      organizationId: 55,
      region: "CA",
      at: "2026-05-21T00:01:00.000Z",
      previousHash: firstHash,
    };
    const secondPayload = buildEvidenceEventHashPayload(second);
    const secondHash = chain(second.previousHash, secondPayload);

    expect(verifyChain([
      { previousHash: first.previousHash, currentHash: firstHash, payload: firstPayload },
      { previousHash: second.previousHash, currentHash: secondHash, payload: secondPayload },
    ])).toEqual({ valid: true });
  });

  it("fails verification when an evidence event row is tampered with", () => {
    const event = {
      packetId: 202,
      eventType: "SYNTHETIC_EVIDENCE_EVENT",
      description: "Original description.",
      statuteVersionId: null,
      organizationId: 77,
      region: "CA",
      at: "2026-05-21T00:00:00.000Z",
      previousHash: "GENESIS",
    };
    const storedHash = chain(event.previousHash, buildEvidenceEventHashPayload(event));
    const tamperedPayload = buildEvidenceEventHashPayload({
      ...event,
      description: "Tampered description.",
    });

    const result = verifyChain([
      { previousHash: event.previousHash, currentHash: storedHash, payload: tamperedPayload },
    ]);

    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(0);
    expect(result.actualHash).toBe(storedHash);
  });

  it("keeps null previous hash compatibility for legacy chain callers", () => {
    const payload = { eventType: "LEGACY_SYNTHETIC_EVENT" };

    expect(chain(null, payload)).toBe(chain(undefined, payload));
  });
});
