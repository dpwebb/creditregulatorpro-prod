import { describe, expect, it } from "vitest";

import {
  classifyResponseDocument,
  RESPONSE_CLASSIFIER_CONFIDENCE_THRESHOLD,
  RESPONSE_CLASSIFIER_RULE_ID,
} from "../../helpers/responseClassificationEngine";

const baseInput = {
  responseEventId: 101,
  responseChannel: "email" as const,
  responseDocumentType: "bureau_email_response" as const,
  responseStatus: "received" as const,
  responseReceivedAt: "2026-05-18T12:00:00.000Z",
  responseSource: "manual_record",
  responseSubject: "Synthetic response",
  responseSenderDomain: "example.test",
  responseReferenceId: "SYNTHETIC-REF",
  normalizedResponseHash: "a".repeat(64),
  attachmentEvidenceId: 201,
  evidenceAttachmentId: 202,
  rawArtifactMetadata: { fileSha256: "a".repeat(64) },
  normalizedResponseMetadata: { senderType: "bureau" },
  relationships: {
    userId: 1,
    packetId: 2,
    disputePacketFindingId: 3,
    findingOutcomeId: 4,
    comparisonRunId: 5,
    bureauId: 6,
    agencyId: null,
    tradelineId: 7,
    violationId: 8,
  },
};

describe("response classification engine", () => {
  it("classifies deterministic response outcomes without mutating readiness or violation truth", () => {
    const result = classifyResponseDocument({
      ...baseInput,
      responseSummary: "The bureau states the item will be deleted and removed from the report.",
    });

    expect(result.classifierRuleId).toBe(RESPONSE_CLASSIFIER_RULE_ID);
    expect(result.classification).toBe("verified_deleted");
    expect(result.classificationConfidence).toBeGreaterThanOrEqual(RESPONSE_CLASSIFIER_CONFIDENCE_THRESHOLD);
    expect(result.processingStatus).toBe("completed");
    expect(result.extractionSource).toBe("deterministic");
    expect(result.fallbackAllowed).toBe(false);
    expect(result.requiresManualReview).toBe(false);
    expect(result.fieldProvenance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "classification",
          responseEventId: 101,
          evidenceAttachmentId: 202,
        }),
      ]),
    );
    expect(result.readinessImpact).toMatchObject({ readinessGateMutated: false });
    expect(result.violationImpact).toMatchObject({ violationTruthMutated: false, linkedViolationId: 8 });
  });

  it("fails closed for adverse, suspicious, unknown, and weakly linked responses", () => {
    const result = classifyResponseDocument({
      ...baseInput,
      responseSummary: "The account remains verified as accurate with no method of verification provided.",
      rawArtifactMetadata: { fileSha256: "b".repeat(64), ocrFallbackUsed: true },
      relationships: {
        ...baseInput.relationships,
        packetId: null,
        tradelineId: null,
        violationId: null,
      },
    });

    expect(result.classification).toBe("remains");
    expect(result.processingStatus).toBe("manual_review");
    expect(result.requiresManualReview).toBe(true);
    expect(result.uncertaintyCodes).toEqual(
      expect.arrayContaining(["ADVERSE_RESPONSE_REQUIRES_REVIEW", "NO_PACKET_LINK", "NO_TRADELINE_LINK", "NO_VIOLATION_LINK", "OCR_FALLBACK_USED"]),
    );
    expect(result.fallbackRequested).toBe(false);
    expect(result.fallbackAllowed).toBe(false);
  });

  it("links suspicious response rationale to review references without confirming a legal violation", () => {
    const result = classifyResponseDocument({
      ...baseInput,
      responseSummary: "The response has no supporting documents and says method of verification not provided.",
    });

    expect(result.classification).toBe("suspicious_non_compliant");
    expect(result.requiresManualReview).toBe(true);
    expect(result.rationale[0]?.message).toMatch(/may require compliance review/i);
    expect(result.regulationReferences.length).toBeGreaterThan(0);
    expect(JSON.stringify(result.regulationReferences)).toContain("RESPONSE_MOV_MISSING");
    expect(JSON.stringify(result.rationale)).not.toMatch(/confirmed legal violation|you won|damages/i);
  });

  it("uses unknown manual review when deterministic text has insufficient signal", () => {
    const result = classifyResponseDocument({
      ...baseInput,
      responseSummary: "We received your letter and will respond later.",
    });

    expect(result.classification).toBe("unknown_manual_review");
    expect(result.processingStatus).toBe("manual_review");
    expect(result.requiresManualReview).toBe(true);
    expect(result.uncertaintyCodes).toContain("LOW_DETERMINISTIC_CONFIDENCE");
  });
});
