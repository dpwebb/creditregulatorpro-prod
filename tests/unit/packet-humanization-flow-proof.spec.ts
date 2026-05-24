// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pdfParse from "pdf-parse";

import {
  attachInternalPacketMetadata,
  buildConsumerDisputedItemInput,
  buildPacketEvidenceLocationsForIssues,
  buildPacketFindingEvidenceLocationSnapshot,
  evaluatePacketReadinessForIssues,
  type PacketConsumerDisputedItemSource,
  type PacketInternalReferenceSource,
} from "../../helpers/disputePacketService";
import {
  buildConsumerDisputePacketLetterText,
  buildSimpleDisputePacketContent,
} from "../../helpers/disputePacketTemplate";
import { buildPacketPreviewDisplayContent } from "../../helpers/packetPreviewDisplay";
import { buildDisputePacketPdfLetterText, generateDisputePacketPDF } from "../../helpers/disputePacketPdf";
import { evaluateViolationPacketConfidenceGate } from "../../helpers/violationPacketConfidenceGate";

const originalFetch = globalThis.fetch;
const owner = { id: 501, role: "user" as const };
const nonOwner = { id: 502, role: "user" as const };
const forbiddenConsumerTerms =
  /tradeline|artifact|report artifact|source report #|field:|PIPEDA_4_5|BALANCE_CALCULATION_VIOLATION|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z|LasReportedDate|Lastreporteddate|lastReportedDate|sourceReportArtifactId|reportArtifactId|tradelineId|Account ending reau|Expected:\s*Not known|PDF rendering is content-based|render\/cache|render and cache|cache retrieval|cache-miss|internal render|system diagnostic/i;

const rawTechnicalDetails = {
  fieldName: "LasReportedDate",
  canonicalField: "lastReportedDate",
  fieldKey: "lastReportedDate",
  sourceField: "sourceReportArtifactId",
  reportedValue: "2012-08-21T00:00:00.000Z",
  expectedValue: "Not known",
  referenceId: "PIPEDA_4_5",
  evidenceId: "rogers-last-reported-evidence",
  evidenceLink: {
    reportArtifactId: 7701,
    evidenceId: "rogers-last-reported-evidence",
    canonicalEvidenceId: "canonical-rogers-last-reported",
    fieldName: "LasReportedDate",
    fieldKey: "lastReportedDate",
    sourceField: "sourceReportArtifactId",
    pageNumber: 4,
    textSnippet: "field: LasReportedDate; source report #7701; referenceId: PIPEDA_4_5",
  },
  deterministicRule: {
    ruleId: "BALANCE_CALCULATION_VIOLATION",
    regulationIds: ["PIPEDA_4_5"],
    evidence: {
      reportArtifactId: 7701,
      canonicalEvidenceId: "canonical-rogers-last-reported",
      fieldName: "LasReportedDate",
      fieldKey: "lastReportedDate",
      sourceField: "sourceReportArtifactId",
      pageNumber: 4,
    },
  },
  extractionConfidenceGate: {
    status: "confirmed",
    packetReady: true,
    confidenceScore: 99,
    requiresManualReview: false,
    reasonCodes: [],
  },
};

const reportArtifactData = {
  evidenceLocationIndex: {
    "rogers-last-reported-evidence": {
      evidenceId: "rogers-last-reported-evidence",
      fieldKey: "lastReportedDate",
      sourceField: "sourceReportArtifactId",
      sourceMethod: "pdf_text",
      extractionMethod: "native_pdf_text",
      pageNumber: 4,
      sectionName: "tradeline_accounts",
      ruleId: "BALANCE_CALCULATION_VIOLATION",
      confidence: 1,
      provenance: {
        deterministicPipelineVersion: "proof-v1",
        documentBinarySha256: "document-sha-proof",
        rawTextSha256: "raw-text-sha-proof",
        canonicalResultSha256: "canonical-sha-proof",
        replayHash: "replay-sha-proof",
      },
    },
  },
};

function rogersFinding(): PacketConsumerDisputedItemSource & PacketInternalReferenceSource {
  return {
    issueId: 4201,
    issueUserExplanation: "PIPEDA_4_5 source report #7701 field: LasReportedDate tradelineId: 2201",
    issueRecommendedAction: "Expected: Not known",
    issueViolationCategory: "BALANCE_CALCULATION_VIOLATION",
    issueDisputeVector: null,
    issueTechnicalDetails: rawTechnicalDetails,
    bureauName: "TransUnion Canada",
    consumerProvince: "NS",
    tradelineId: 2201,
    accountNumber: "reau",
    creditorName: "Rogers Communications",
    accountType: "Wireless",
    balance: "$200",
    currentBalance: "$200",
    creditLimit: "$1,000",
    highCredit: "$500",
    amountPastDue: "$0",
    status: "Open",
    openedDate: new Date("2020-01-01T00:00:00.000Z"),
    dateClosed: null,
    dateOfFirstDelinquency: null,
    dateOfLastPayment: null,
    lastActivityDate: null,
    lastReportedDate: new Date("2012-08-21T00:00:00.000Z"),
    collectionAgencyName: null,
    originalCreditorName: null,
    isCollectionAccount: null,
    reportArtifactId: 7701,
    reportArtifactData,
    reportDate: new Date("2026-01-10T00:00:00.000Z"),
    sourceText: "source report #7701 field: LasReportedDate account ending reau referenceId: PIPEDA_4_5",
  };
}

async function extractPdfText(base64: string): Promise<string> {
  const data = await pdfParse(Buffer.from(base64, "base64") as any);
  return data.text.replace(/\s+/g, " ").trim();
}

describe("simulated packet humanization flow proof", () => {
  beforeEach(() => {
    delete process.env.CRP_PDF_REMOTE_FONT_FETCH;
    globalThis.fetch = vi.fn(async () => {
      throw new Error("Remote font fetch must not run for packet proof PDF rendering");
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.CRP_PDF_REMOTE_FONT_FETCH;
  });

  it("keeps consumer preview/PDF human-readable while preserving internal packet truth", async () => {
    const row = rogersFinding();
    const readinessIssue = {
      issueId: row.issueId,
      userId: owner.id,
      tradelineId: row.tradelineId,
      bureauId: 33,
      userStatus: "active",
      validationStatus: "PENDING",
      technicalDetails: row.issueTechnicalDetails,
      evidenceReference: "Relevant report section for Date last reported on page 4.",
      packetTypes: ["credit_bureau" as const],
    };
    const readiness = evaluatePacketReadinessForIssues(
      owner,
      { packetType: "credit_bureau", selectedIssueIds: [row.issueId], recipientBureauId: 33 },
      [readinessIssue],
    );
    expect(readiness).toMatchObject({
      packetReady: true,
      blockers: [],
      warnings: [],
      eligibleFindingIds: [row.issueId],
      ineligibleFindingIds: [],
      reasonCodes: [],
    });
    expect(evaluateViolationPacketConfidenceGate({ technicalDetails: row.issueTechnicalDetails })).toMatchObject({
      packetReady: true,
      blockerCode: null,
      confidenceScore: 99,
    });

    const nonOwnerReadiness = evaluatePacketReadinessForIssues(
      nonOwner,
      { packetType: "credit_bureau", selectedIssueIds: [row.issueId], recipientBureauId: 33 },
      [readinessIssue],
    );
    expect(nonOwnerReadiness.packetReady).toBe(false);
    expect(nonOwnerReadiness.reasonCodes).toContain("UNAUTHORIZED_FINDING");
    expect(nonOwnerReadiness.eligibleFindingIds).toEqual([]);

    const evidenceLocations = buildPacketEvidenceLocationsForIssues([
      {
        issueId: row.issueId,
        reportArtifactId: row.reportArtifactId,
        reportArtifactData: row.reportArtifactData,
        technicalDetails: row.issueTechnicalDetails,
      },
    ]);
    const packet = attachInternalPacketMetadata(
      {
        ...buildSimpleDisputePacketContent({
          packetType: "credit_bureau",
          reportType: "TransUnion Canada credit report",
          reportDate: "2026-01-10T00:00:00.000Z",
          dateGenerated: "2026-05-21T00:00:00.000Z",
          recipient: {
            type: "credit_bureau",
            name: "TransUnion Canada",
            address: ["Consumer Relations", "3115 Harvester Road"],
          },
          consumer: {
            name: "Proof Consumer",
            address: ["1 Main St", "Halifax, NS B3H 0A1"],
            email: "proof@example.com",
          },
          disputedItems: [buildConsumerDisputedItemInput(row, "credit_bureau")],
          reportArtifactIds: [row.reportArtifactId],
          generatedByUserId: owner.id,
        }),
        evidenceLocations,
      },
      [row],
      readiness,
    );
    const createdPacket = {
      packetId: 8801,
      status: "generated",
      ownerUserId: owner.id,
      creditorObligationTestId: row.issueId,
      packet,
    };
    const preview = buildPacketPreviewDisplayContent(createdPacket.packet);
    const previewText = [
      preview.letterText,
      ...preview.evidenceSummary,
      ...preview.attachmentChecklist,
    ].join("\n");
    const templateLetterText = buildConsumerDisputePacketLetterText(createdPacket.packet);
    const pdfLetterText = buildDisputePacketPdfLetterText(createdPacket.packet);
    const base64Pdf = await generateDisputePacketPDF(createdPacket.packet);
    const pdfText = await extractPdfText(base64Pdf);
    const pdfBytes = Buffer.from(base64Pdf, "base64");
    const retrievalResponse = new Response(
      pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer,
      {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Length": String(pdfBytes.length),
        },
      },
    );

    expect(preview.letterText).toBe(templateLetterText);
    expect(pdfBytes.subarray(0, 4).toString("utf8")).toBe("%PDF");
    expect(retrievalResponse.status).toBe(200);
    expect(retrievalResponse.headers.get("Content-Type")).toBe("application/pdf");
    expect(Number(retrievalResponse.headers.get("Content-Length"))).toBeGreaterThan(1000);

    for (const consumerText of [previewText, pdfLetterText, pdfText]) {
      expect(consumerText).toContain("Subject: Dispute of Credit Report Information");
      expect(consumerText).toContain("Creditor/Reporter: Rogers Communications");
      expect(consumerText).toContain("Account Number: Account number not shown on report");
      expect(consumerText).toContain("Date last reported");
      expect(consumerText).toContain("Aug 21, 2012");
      expect(consumerText).toContain("Rogers Communications");
      expect(consumerText).toContain("This account appears to remain on my credit file beyond the appropriate reporting period.");
      expect(consumerText).toContain("Please investigate this item and update my credit file accordingly.");
      expect(consumerText).not.toMatch(/\billegal\b|\btime-barred\b|\bobsolete\b/i);
      expect(consumerText).not.toMatch(forbiddenConsumerTerms);
    }

    expect(previewText).toContain("Account Number: Account number not shown on report");
    expect(previewText).toContain("Date Reported / Last Activity: Date last reported: Aug 21, 2012");
    expect(previewText).not.toContain("Reason for dispute:");
    expect(previewText).not.toContain("Factual basis:");
    expect(previewText).not.toContain("Verification requested:");
    expect(previewText).not.toContain("Requested remedies:");
    expect(previewText).not.toContain("Evidence references:");
    expect(pdfText).toContain("Account Number: Account number not shown on report");
    expect(pdfText).toContain("Date Reported / Last Activity: Date last reported: Aug 21, 2012");
    expect(pdfText).not.toContain("What I am requesting");

    expect(createdPacket).toMatchObject({
      packetId: 8801,
      status: "generated",
      ownerUserId: owner.id,
      creditorObligationTestId: row.issueId,
    });
    expect(createdPacket.packet.disputedItems[0]).toMatchObject({
      issueId: row.issueId,
      tradelineId: row.tradelineId,
      creditorCollectorName: "Rogers Communications",
      maskedAccountNumber: "Account identifier unavailable",
      disputedField: "Date last reported",
      reportedValue: "Aug 21, 2012",
      narrative: expect.objectContaining({
        disputeCategory: "POSSIBLE_OBSOLETE_OR_STALE_REPORTING",
        disputeIntent: "OBSOLETE_REPORTING",
        cautionLevel: "CAUTIOUS",
        consumerAssertion: "This account appears to remain on my credit file beyond the appropriate reporting period.",
        internalReference: expect.stringContaining("finding:4201"),
        externalReferenceDisplay: "Issue 4201",
        verificationRequests: expect.arrayContaining([
          "Verify the date of first delinquency/default if applicable.",
          "Verify the basis for continuing to publish this item on the current report.",
        ]),
        factualBasis: expect.arrayContaining([
          "Account number not shown on report; see attached report page.",
        ]),
        requestedRemedies: expect.arrayContaining([
          "Remove or suppress the item if it is not reportable.",
        ]),
        evidenceReferences: expect.arrayContaining([
          "See attached TransUnion Canada credit report dated Jan 10, 2026, Rogers Communications entry, showing Date last reported: Aug 21, 2012.",
        ]),
      }),
    });
    expect(createdPacket.packet.metadata).toMatchObject({
      selectedIssueIds: [row.issueId],
      reportArtifactIds: [row.reportArtifactId],
      generatedByUserId: owner.id,
      internalReferences: [
        expect.objectContaining({
          findingId: row.issueId,
          violationId: row.issueId,
          tradelineId: row.tradelineId,
          reportArtifactId: row.reportArtifactId,
          evidenceIds: expect.arrayContaining(["rogers-last-reported-evidence", "canonical-rogers-last-reported"]),
          regulationIds: ["PIPEDA_4_5"],
          ruleIds: ["BALANCE_CALCULATION_VIOLATION"],
          fieldKey: "lastReportedDate",
          sourceField: "sourceReportArtifactId",
          readiness: expect.objectContaining({
            packetReady: true,
            findingEligible: true,
          }),
        }),
      ],
    });
    expect(
      buildPacketFindingEvidenceLocationSnapshot({
        packet: createdPacket.packet,
        issueId: row.issueId,
        reportArtifactId: row.reportArtifactId,
        reportArtifactData: row.reportArtifactData,
        technicalDetails: row.issueTechnicalDetails,
      }),
    ).toEqual([
      expect.objectContaining({
        evidenceId: "rogers-last-reported-evidence",
        fieldKey: "lastReportedDate",
        sourceField: "sourceReportArtifactId",
        pageNumber: 4,
        ruleId: "BALANCE_CALCULATION_VIOLATION",
      }),
    ]);

    expect(row.accountNumber).toBe("reau");
    expect(row.lastReportedDate?.toISOString()).toBe("2012-08-21T00:00:00.000Z");
    expect(rawTechnicalDetails.referenceId).toBe("PIPEDA_4_5");
    expect(rawTechnicalDetails.deterministicRule.ruleId).toBe("BALANCE_CALCULATION_VIOLATION");
  });
});
