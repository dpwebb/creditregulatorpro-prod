import { describe, expect, it } from "vitest";

import {
  evaluateParserConfidenceGateFromArtifactData,
  evaluateViolationPacketConfidenceGate,
  normalizeParserConfidenceScore,
} from "../../helpers/violationPacketConfidenceGate";

describe("violation packet confidence gate", () => {
  it("normalizes fractional and whole-number parser confidence scores", () => {
    expect(normalizeParserConfidenceScore(0.82)).toBe(82);
    expect(normalizeParserConfidenceScore(82)).toBe(82);
    expect(normalizeParserConfidenceScore("91")).toBe(91);
    expect(normalizeParserConfidenceScore("not-a-score")).toBeNull();
  });

  it("blocks auto violations when parser quality requires manual review", () => {
    const gate = evaluateParserConfidenceGateFromArtifactData({
      parserQuality: {
        confidenceScore: 48,
        requiresManualReview: true,
        issues: [
          {
            severity: "ERROR",
            code: "PARSER_ZERO_TRADELINES",
            message: "No tradelines parsed.",
          },
        ],
      },
    });

    expect(gate.status).toBe("parser_uncertain");
    expect(gate.packetReady).toBe(false);
    expect(gate.reasonCodes).toContain("PARSER_REQUIRES_MANUAL_REVIEW");
    expect(gate.reasonCodes).toContain("PARSER_ERROR_ISSUE");
  });

  it("requires user verification for medium-confidence findings", () => {
    const parserGate = evaluateParserConfidenceGateFromArtifactData({
      parserQuality: {
        confidenceScore: 78,
        requiresManualReview: false,
        issues: [],
      },
    });

    expect(parserGate.status).toBe("needs_user_review");
    expect(parserGate.packetReady).toBe(false);

    const activeViolationGate = evaluateViolationPacketConfidenceGate({
      technicalDetails: { extractionConfidenceGate: parserGate },
      validationStatus: "NEEDS_USER_REVIEW",
      userStatus: "active",
    });
    expect(activeViolationGate.packetReady).toBe(false);
    expect(activeViolationGate.blockerCode).toBe("violation_needs_review");

    const verifiedViolationGate = evaluateViolationPacketConfidenceGate({
      technicalDetails: { extractionConfidenceGate: parserGate },
      validationStatus: "NEEDS_USER_REVIEW",
      userStatus: "verified",
    });
    expect(verifiedViolationGate.packetReady).toBe(true);
    expect(verifiedViolationGate.blockerCode).toBeNull();
  });

  it("allows confirmed and unknown legacy metadata through", () => {
    const confirmedGate = evaluateParserConfidenceGateFromArtifactData({
      parserQuality: {
        confidenceScore: 92,
        requiresManualReview: false,
        issues: [],
      },
    });
    expect(confirmedGate.status).toBe("confirmed");
    expect(confirmedGate.packetReady).toBe(true);

    const legacyGate = evaluateParserConfidenceGateFromArtifactData({});
    expect(legacyGate.status).toBe("unknown");
    expect(legacyGate.packetReady).toBe(true);
  });
});
