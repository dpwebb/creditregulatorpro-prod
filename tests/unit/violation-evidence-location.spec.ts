import { describe, expect, it } from "vitest";

import type { DetectedViolation } from "../../helpers/complianceDetectorTypes";
import { enrichDetectedViolationRuleEvidence } from "../../helpers/violationRuleEvidence";

const provenance = {
  deterministicPipelineVersion: "test-v1",
  documentBinarySha256: "document-sha",
  rawTextSha256: "raw-sha",
  canonicalResultSha256: "canonical-sha",
  replayHash: "replay-sha",
};

function violation(overrides: Partial<DetectedViolation> = {}): DetectedViolation {
  return {
    violationCategory: "BALANCE_CALCULATION_VIOLATION",
    severity: "WARNING",
    confidenceScore: 92,
    userExplanation: "The reported balance does not match the available account values.",
    technicalDetails: {
      fieldName: "balance",
      detectedValue: 1250,
      regulationIds: ["PIPEDA_4_6"],
      evidenceLink: {
        reportArtifactId: 77,
        evidenceId: "evidence-balance",
        field: "balance",
        textSnippet: "Balance $1,250. High credit $900.",
      },
    },
    recommendedAction: "Ask the reporting party to review the balance.",
    tradelineId: 42,
    responsibleEntity: "CREDITOR",
    ...overrides,
  };
}

describe("violation evidence location enrichment", () => {
  it("preserves existing evidenceLink fields and adds resolved evidenceLocation", () => {
    const enriched = enrichDetectedViolationRuleEvidence(violation(), {
      reportArtifactDataById: {
        77: {
          evidenceLocationIndex: {
            "evidence-balance": {
              evidenceId: "evidence-balance",
              fieldKey: "tradelines[0].balance",
              sourceField: "pdf_text.parseResult.tradelines[0].balance",
              sourceMethod: "pdf_text",
              extractionMethod: "native_pdf_text",
              pageNumber: 2,
              sectionName: "tradeline_accounts",
              zoneName: "tradeline_accounts",
              textSnippet: "Balance $1,250. High credit $900.",
              tokenIndexes: [3, 4, 5],
              ruleId: "canonical-field-selected-v1",
              confidence: 1,
              provenance,
            },
          },
        },
      },
    });

    expect(enriched.violationCategory).toBe("BALANCE_CALCULATION_VIOLATION");
    expect(enriched.technicalDetails.evidenceLink).toEqual(
      expect.objectContaining({
        reportArtifactId: 77,
        field: "balance",
        fieldName: "balance",
        evidenceId: "evidence-balance",
        textSnippet: "Balance $1,250. High credit $900.",
      }),
    );
    expect(enriched.technicalDetails.evidenceLink.evidenceLocation).toEqual(
      expect.objectContaining({
        evidenceId: "evidence-balance",
        fieldKey: "tradelines[0].balance",
        pageNumber: 2,
        sourceMethod: "pdf_text",
        extractionMethod: "native_pdf_text",
      }),
    );
    expect(enriched.technicalDetails.evidenceLink.evidenceLocation).not.toHaveProperty("boundingBox");
  });

  it("keeps evidenceLocation additive when resolved metadata includes a boundingBox", () => {
    const enriched = enrichDetectedViolationRuleEvidence(violation(), {
      reportArtifactDataById: {
        77: {
          evidenceLocationIndex: {
            "evidence-balance": {
              evidenceId: "evidence-balance",
              fieldKey: "tradelines[0].balance",
              sourceField: "pdf_text.parseResult.tradelines[0].balance",
              sourceMethod: "pdf_text",
              extractionMethod: "native_pdf_text",
              pageNumber: 2,
              textSnippet: "Balance $1,250. High credit $900.",
              boundingBox: {
                x: 100,
                y: 200,
                width: 90,
                height: 12,
                unit: "pt",
                pageNumber: 2,
                coordinateSource: "pdfjs_text_item",
                coordinateValidated: true,
              },
              itemSpanIndexes: [3, 4],
              matchedTextHash: "a".repeat(64),
              coordinateExtractorVersion: "pdfjs-coordinate-extractor-v1",
              provenance,
            },
          },
        },
      },
    });

    expect(enriched.technicalDetails.evidenceLink).toEqual(
      expect.objectContaining({
        reportArtifactId: 77,
        field: "balance",
        fieldName: "balance",
        evidenceId: "evidence-balance",
        textSnippet: "Balance $1,250. High credit $900.",
      }),
    );
    expect(enriched.technicalDetails.evidenceLink.evidenceLocation).toMatchObject({
      evidenceId: "evidence-balance",
      fieldKey: "tradelines[0].balance",
      boundingBox: {
        x: 100,
        y: 200,
        width: 90,
        height: 12,
        unit: "pt",
        pageNumber: 2,
        coordinateSource: "pdfjs_text_item",
        coordinateValidated: true,
      },
      itemSpanIndexes: [3, 4],
    });
  });

  it("omits evidenceLocation when no sidecar exists", () => {
    const enriched = enrichDetectedViolationRuleEvidence(violation());

    expect(enriched.technicalDetails.evidenceLink).not.toHaveProperty("evidenceLocation");
  });

  it("omits evidenceLocation when field fallback is ambiguous", () => {
    const ambiguous = violation({
      technicalDetails: {
        fieldName: "balance",
        detectedValue: 1250,
        regulationIds: ["PIPEDA_4_6"],
        evidenceLink: {
          reportArtifactId: 77,
          field: "balance",
          textSnippet: "Balance $1,250. High credit $900.",
        },
      },
    });
    const enriched = enrichDetectedViolationRuleEvidence(ambiguous, {
      reportArtifactDataById: new Map([
        [
          77,
          {
            evidenceLocationIndex: {
              "evidence-balance-0": {
                evidenceId: "evidence-balance-0",
                fieldKey: "tradelines[0].balance",
                provenance,
              },
              "evidence-balance-1": {
                evidenceId: "evidence-balance-1",
                fieldKey: "tradelines[1].balance",
                provenance,
              },
            },
          },
        ],
      ]),
    });

    expect(enriched.technicalDetails.evidenceLink).not.toHaveProperty("evidenceLocation");
  });
});
