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

    expect(result.classification).toBe("suspicious_non_compliant");
    expect(result.processingStatus).toBe("manual_review");
    expect(result.requiresManualReview).toBe(true);
    expect(result.uncertaintyCodes).toEqual(
      expect.arrayContaining(["SUSPICIOUS_RESPONSE_PATTERN", "MIXED_RESPONSE_SIGNALS", "NO_PACKET_LINK", "NO_TRADELINE_LINK", "NO_VIOLATION_LINK", "OCR_FALLBACK_USED"]),
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

  it.each([
    ["verified as accurate", "The account was verified as accurate and will remain as reported.", "remains", true],
    ["previously verified", "This dispute was previously verified by our office.", "remains", true],
    ["unable to verify", "We are unable to verify the disputed information.", "unable_to_verify", false],
    ["deleted", "The tradeline will be deleted from the report.", "verified_deleted", false],
    ["updated", "We updated the balance and corrected the reported status.", "updated", false],
    ["frivolous", "We consider this dispute frivolous and will not investigate further.", "frivolous", true],
    ["duplicate dispute", "This is a duplicate dispute that was already investigated.", "duplicate", true],
    ["unknown", "Thank you for contacting us.", "unknown_manual_review", true],
  ] as const)("classifies %s response language with expected review handling", (_label, responseSummary, classification, manualReview) => {
    const result = classifyResponseDocument({
      ...baseInput,
      responseSummary,
    });

    expect(result.classification).toBe(classification);
    expect(result.requiresManualReview).toBe(manualReview);
    expect(result.extractionSource).toBe("deterministic");
    expect(result.fallbackAllowed).toBe(false);
  });

  it("does not treat negated deletion or update wording as completed outcomes", () => {
    const deleted = classifyResponseDocument({
      ...baseInput,
      responseSummary: "The account was reviewed and will not be deleted from the report.",
    });
    const updated = classifyResponseDocument({
      ...baseInput,
      responseSummary: "The balance was reviewed and will not be updated or corrected.",
    });

    expect(deleted.classification).toBe("unknown_manual_review");
    expect(deleted.processingStatus).toBe("manual_review");
    expect(updated.classification).toBe("unknown_manual_review");
    expect(updated.processingStatus).toBe("manual_review");
  });

  it("fails closed for mixed or contradictory deterministic outcome language", () => {
    const result = classifyResponseDocument({
      ...baseInput,
      responseSummary: "The item was verified as accurate, but it will also be deleted from the file.",
    });

    expect(result.classification).toBe("unknown_manual_review");
    expect(result.processingStatus).toBe("manual_review");
    expect(result.requiresManualReview).toBe(true);
    expect(result.uncertaintyCodes).toEqual(expect.arrayContaining(["CONTRADICTORY_RESPONSE_LANGUAGE"]));
  });

  it("classifies hostile or non-compliant response patterns as suspicious manual review", () => {
    const result = classifyResponseDocument({
      ...baseInput,
      responseSummary: "The account was automated verification only, with no supporting documents and no reinvestigation.",
    });

    expect(result.classification).toBe("suspicious_non_compliant");
    expect(result.processingStatus).toBe("manual_review");
    expect(result.regulationReferences.length).toBeGreaterThan(0);
  });

  it("does not classify from metadata-only labels or OCR-damaged empty text", () => {
    const result = classifyResponseDocument({
      ...baseInput,
      responseSubject: "",
      responseSummary: "",
      rawArtifactMetadata: { fileSha256: "c".repeat(64), ocrFallbackUsed: true },
      normalizedResponseMetadata: { responseFamily: "verified", operationalLabel: "deleted" },
    });

    expect(result.classification).toBe("unknown_manual_review");
    expect(result.processingStatus).toBe("manual_review");
    expect(result.uncertaintyCodes).toEqual(expect.arrayContaining(["LOW_DETERMINISTIC_CONFIDENCE", "OCR_FALLBACK_USED"]));
  });
});
