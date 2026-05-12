import { describe, expect, it } from "vitest";

import {
  buildPacketEvidenceLocationsForIssues,
  evaluatePacketReadinessForIssues,
} from "../../helpers/disputePacketService";
import { buildSimpleDisputePacketContent } from "../../helpers/disputePacketTemplate";

const provenance = {
  deterministicPipelineVersion: "test-v1",
  documentBinarySha256: "document-sha",
  rawTextSha256: "raw-sha",
  canonicalResultSha256: "canonical-sha",
  replayHash: "replay-sha",
};

function packet() {
  return buildSimpleDisputePacketContent({
    packetType: "credit_bureau",
    reportType: "TransUnion credit report",
    reportDate: "2026-04-15",
    recipient: {
      type: "credit_bureau",
      name: "TransUnion Canada",
      address: ["Consumer Relations", "3115 Harvester Road", "Burlington, ON L7N 3N8"],
    },
    consumer: {
      name: "Test Consumer",
      address: ["1 Main St", "Halifax, NS B3H 0A1"],
    },
    disputedItems: [
      {
        issueId: 10,
        tradelineId: 20,
        creditorCollectorName: "Sample Bank",
        sourceFurnisherName: "Sample Bank",
        accountNumber: "123456789012",
        disputedField: "balance",
        reportedValue: "$900",
        expectedValue: "$0",
        issueType: "BALANCE_CALCULATION_VIOLATION",
        explanation: "The balance may be inaccurate.",
        evidenceReference: "Source report #7; field: balance; page 2",
      },
    ],
    reportArtifactIds: [7],
  });
}

describe("packet evidence location metadata", () => {
  it("builds structured evidence location metadata without changing readable evidence references", () => {
    const basePacket = packet();
    const evidenceLocations = buildPacketEvidenceLocationsForIssues([
      {
        issueId: 10,
        reportArtifactId: 7,
        technicalDetails: {
          evidenceLink: {
            reportArtifactId: 7,
            evidenceId: "evidence-balance",
            field: "balance",
          },
        },
        reportArtifactData: {
          evidenceLocationIndex: {
            "evidence-balance": {
              evidenceId: "evidence-balance",
              fieldKey: "tradelines[0].balance",
              sourceField: "pdf_text.parseResult.tradelines[0].balance",
              sourceMethod: "pdf_text",
              extractionMethod: "native_pdf_text",
              pageNumber: 2,
              textSnippet: "Balance $900 Expected $0",
              tokenIndexes: [7, 8],
              provenance,
            },
          },
        },
      },
    ]);
    const enrichedPacket = evidenceLocations ? { ...basePacket, evidenceLocations } : basePacket;

    expect(enrichedPacket.disputedItems[0].evidenceReference).toBe(
      "Source report #7; field: balance; page 2",
    );
    expect(enrichedPacket.evidenceList).toEqual(["Source report #7; field: balance; page 2"]);
    expect(enrichedPacket.evidenceLocations?.["10"]).toEqual([
      expect.objectContaining({
        evidenceId: "evidence-balance",
        fieldKey: "tradelines[0].balance",
        pageNumber: 2,
        sourceMethod: "pdf_text",
      }),
    ]);
    expect(enrichedPacket.evidenceLocations?.["10"][0]).not.toHaveProperty("boundingBox");
  });

  it("keeps packet references and readiness unchanged when evidenceLocation includes a boundingBox", () => {
    const basePacket = packet();
    const evidenceLocations = buildPacketEvidenceLocationsForIssues([
      {
        issueId: 10,
        reportArtifactId: 7,
        technicalDetails: {
          evidenceLink: {
            reportArtifactId: 7,
            evidenceId: "evidence-balance",
            field: "balance",
          },
        },
        reportArtifactData: {
          evidenceLocationIndex: {
            "evidence-balance": {
              evidenceId: "evidence-balance",
              fieldKey: "tradelines[0].balance",
              sourceField: "pdf_text.parseResult.tradelines[0].balance",
              sourceMethod: "pdf_text",
              extractionMethod: "native_pdf_text",
              pageNumber: 2,
              textSnippet: "Balance $900 Expected $0",
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
              itemSpanIndexes: [7, 8],
              coordinateExtractorVersion: "pdfjs-coordinate-extractor-v1",
              provenance,
            },
          },
        },
      },
    ]);
    const enrichedPacket = evidenceLocations ? { ...basePacket, evidenceLocations } : basePacket;
    const readiness = evaluatePacketReadinessForIssues(
      { id: 1, role: "user" },
      { packetType: "credit_bureau", selectedIssueIds: [10] },
      [
        {
          issueId: 10,
          userId: 1,
          tradelineId: 20,
          bureauId: 30,
          userStatus: "active",
          validationStatus: "PENDING",
          technicalDetails: {
            extractionConfidenceGate: {
              status: "confirmed",
              packetReady: true,
              confidenceScore: 95,
              requiresManualReview: false,
              reasonCodes: [],
            },
          },
          evidenceReference: "Source report #7; field: balance; page 2",
          packetTypes: ["credit_bureau"],
        },
      ],
    );

    expect(enrichedPacket.disputedItems[0].evidenceReference).toBe(
      "Source report #7; field: balance; page 2",
    );
    expect(enrichedPacket.evidenceList).toEqual(["Source report #7; field: balance; page 2"]);
    expect(enrichedPacket.evidenceLocations?.["10"][0]).toMatchObject({
      evidenceId: "evidence-balance",
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
      itemSpanIndexes: [7, 8],
    });
    expect(readiness.packetReady).toBe(true);
    expect(readiness.reasonCodes).toEqual([]);
  });

  it("allows packet creation inputs to remain ready when evidenceLocation is unavailable", () => {
    const evidenceLocations = buildPacketEvidenceLocationsForIssues([
      {
        issueId: 10,
        reportArtifactId: 7,
        technicalDetails: {
          evidenceLink: {
            reportArtifactId: 7,
            field: "balance",
          },
        },
        reportArtifactData: null,
      },
    ]);

    const readiness = evaluatePacketReadinessForIssues(
      { id: 1, role: "user" },
      { packetType: "credit_bureau", selectedIssueIds: [10] },
      [
        {
          issueId: 10,
          userId: 1,
          tradelineId: 20,
          bureauId: 30,
          userStatus: "active",
          validationStatus: "PENDING",
          technicalDetails: {
            extractionConfidenceGate: {
              status: "confirmed",
              packetReady: true,
              confidenceScore: 95,
              requiresManualReview: false,
              reasonCodes: [],
            },
          },
          evidenceReference: "Source report #7; field: balance; page 2",
          packetTypes: ["credit_bureau"],
        },
      ],
    );

    expect(evidenceLocations).toBeUndefined();
    expect(readiness.packetReady).toBe(true);
    expect(readiness.reasonCodes).toEqual([]);
  });
});
