import { describe, expect, it } from "vitest";

import {
  attachInternalPacketMetadata,
  buildConsumerDisputedItemInput,
  buildPacketEvidenceLocationsForIssues,
  buildPacketFindingEvidenceLocationSnapshot,
  evaluatePacketReadinessForIssues,
  type PacketConsumerDisputedItemSource,
  type PacketInternalReferenceSource,
  type PacketReadinessResult,
} from "../../helpers/disputePacketService";
import {
  buildConsumerDisputePacketLetterText,
  buildSimpleDisputePacketContent,
} from "../../helpers/disputePacketTemplate";
import { buildDisputePacketPdfLetterText } from "../../helpers/disputePacketPdf";

const owner = { id: 10, role: "user" as const };
const nonOwner = { id: 11, role: "user" as const };

const rawTechnicalDetails = {
  fieldName: "sourceReportArtifactId",
  canonicalField: "lastReportedDate",
  fieldKey: "lastReportedDate",
  sourceField: "sourceReportArtifactId",
  reportedValue: "2012-08-21T00:00:00.000Z",
  expectedValue: "Not known",
  referenceId: "PIPEDA_4_5",
  evidenceId: "evidence-last-reported",
  evidenceLink: {
    reportArtifactId: 77,
    evidenceId: "evidence-last-reported",
    canonicalEvidenceId: "canonical-last-reported",
    fieldName: "lastReportedDate",
    fieldKey: "lastReportedDate",
    sourceField: "sourceReportArtifactId",
    pageNumber: 4,
    textSnippet: "field: lastReportedDate; source report #77; referenceId: PIPEDA_4_5",
  },
  deterministicRule: {
    ruleId: "BALANCE_CALCULATION_VIOLATION",
    regulationIds: ["PIPEDA_4_5"],
    evidence: {
      reportArtifactId: 77,
      canonicalEvidenceId: "canonical-last-reported",
      fieldName: "lastReportedDate",
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

const forbiddenConsumerPacketOutput =
  /tradeline|artifact|report artifact|source report #|field:|PIPEDA_|BALANCE_CALCULATION_VIOLATION|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z|LasReportedDate|Lastreporteddate|lastReportedDate|sourceReportArtifactId|reportArtifactId|tradelineId|Account ending reau|Expected:\s*Not known|PDF rendering is content-based|render\/cache|render and cache|cache retrieval|cache-miss|internal render|system diagnostic/i;

const reportArtifactData = {
  evidenceLocationIndex: {
    "evidence-last-reported": {
      evidenceId: "evidence-last-reported",
      fieldKey: "lastReportedDate",
      sourceField: "sourceReportArtifactId",
      sourceMethod: "pdf_text",
      extractionMethod: "native_pdf_text",
      pageNumber: 4,
      sectionName: "tradeline_accounts",
      ruleId: "BALANCE_CALCULATION_VIOLATION",
      confidence: 1,
      provenance: {
        deterministicPipelineVersion: "test-v1",
        documentBinarySha256: "document-sha",
        rawTextSha256: "raw-text-sha",
        canonicalResultSha256: "canonical-sha",
        replayHash: "replay-sha",
      },
    },
  },
};

function sourceRow(): PacketConsumerDisputedItemSource & PacketInternalReferenceSource {
  return {
    issueId: 111,
    issueUserExplanation: "Raw reference PIPEDA_4_5 from source report #77 field: lastReportedDate.",
    issueRecommendedAction: "Expected: Not known",
    issueViolationCategory: "DATE_REPORTING",
    issueDisputeVector: null,
    issueTechnicalDetails: rawTechnicalDetails,
    bureauName: "Synthetic Bureau",
    consumerProvince: "NS",
    tradelineId: 222,
    accountNumber: "reau",
    creditorName: "Synthetic Bank",
    accountType: "Installment",
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
    reportArtifactId: 77,
    reportArtifactData,
    reportDate: new Date("2026-05-11T00:00:00.000Z"),
    sourceText: "source report #77 field: lastReportedDate referenceId: PIPEDA_4_5",
  };
}

function readyState(): PacketReadinessResult {
  return {
    packetReady: true,
    blockers: [],
    warnings: [],
    eligibleFindingIds: [111],
    ineligibleFindingIds: [],
    reasonCodes: [],
  };
}

describe("dispute packet service consumer/internal separation", () => {
  it("keeps raw IDs in metadata and evidence while body-facing text stays humanized", () => {
    const row = sourceRow();
    const evidenceLocations = buildPacketEvidenceLocationsForIssues([
      {
        issueId: row.issueId,
        reportArtifactId: row.reportArtifactId,
        reportArtifactData: row.reportArtifactData,
        technicalDetails: row.issueTechnicalDetails,
      },
    ]);
    const basePacket = buildSimpleDisputePacketContent({
      packetType: "credit_bureau",
      reportType: "Synthetic Bureau credit report",
      reportDate: new Date("2026-05-11T00:00:00.000Z"),
      recipient: {
        type: "credit_bureau",
        name: "Synthetic Bureau",
        address: ["200 Bureau Test Street", "Toronto, ON M5J 2N8"],
      },
      consumer: {
        name: "Packet Consumer",
        address: ["100 Consumer Avenue", "Halifax, NS B3J 0A1"],
      },
      disputedItems: [buildConsumerDisputedItemInput(row, "credit_bureau")],
      reportArtifactIds: [row.reportArtifactId],
      generatedByUserId: owner.id,
    });
    const packet = attachInternalPacketMetadata(
      { ...basePacket, evidenceLocations },
      [row],
      readyState(),
    );

    const bodyText = `${buildConsumerDisputePacketLetterText(packet)}\n${buildDisputePacketPdfLetterText(packet)}`;

    expect(bodyText).toContain("Subject: Dispute of Credit Report Information");
    expect(bodyText).toContain("Creditor/Reporter: Synthetic Bank");
    expect(bodyText).toContain("Account Number: Account number not shown on report");
    expect(bodyText).toContain("Reported Balance: $200");
    expect(bodyText).toContain("Date Reported / Last Activity: Date last reported: Aug 21, 2012");
    expect(bodyText).toContain("This account appears to remain on my credit file beyond the appropriate reporting period and should no longer be reported.");
    expect(bodyText).toContain("Please investigate this item and update my credit file accordingly.");
    expect(bodyText).toContain("Aug 21, 2012");
    expect(packet.disputedItems[0].narrative?.factualBasis).toContain("The report dated May 11, 2026 shows Synthetic Bank.");
    expect(packet.disputedItems[0].narrative?.consumerAssertion).toContain("continued reportability");
    expect(packet.disputedItems[0].narrative?.verificationRequests).toContain("Verify the date of first delinquency/default if applicable.");
    expect(packet.disputedItems[0].narrative?.requestedRemedies).toContain("Remove or suppress the item if it is not reportable.");
    expect(bodyText).not.toContain("Requested result: Verify the correct information");
    expect(bodyText).not.toContain("Expected: Not known");
    expect(bodyText).not.toMatch(forbiddenConsumerPacketOutput);

    expect(packet.disputedItems[0]).toMatchObject({
      issueId: 111,
      tradelineId: 222,
      disputedField: "Date last reported",
      reportedValue: "Aug 21, 2012",
      maskedAccountNumber: "Account identifier unavailable",
      narrative: expect.objectContaining({
        disputeCategory: "POSSIBLE_OBSOLETE_OR_STALE_REPORTING",
        cautionLevel: "CAUTIOUS",
        evidenceReferences: expect.arrayContaining([
          "See attached Synthetic Bureau credit report dated May 11, 2026, Synthetic Bank entry, showing Date last reported: Aug 21, 2012.",
        ]),
      }),
    });
    expect(packet.metadata).toMatchObject({
      selectedIssueIds: [111],
      reportArtifactIds: [77],
      generatedByUserId: owner.id,
      internalReferences: [
        expect.objectContaining({
          findingId: 111,
          violationId: 111,
          tradelineId: 222,
          reportArtifactId: 77,
          evidenceIds: expect.arrayContaining(["evidence-last-reported", "canonical-last-reported"]),
          regulationIds: expect.arrayContaining(["PIPEDA_4_5"]),
          ruleIds: expect.arrayContaining(["BALANCE_CALCULATION_VIOLATION"]),
          fieldKey: "lastReportedDate",
          sourceField: "sourceReportArtifactId",
          readiness: expect.objectContaining({
            packetReady: true,
            findingEligible: true,
          }),
        }),
      ],
    });
    expect(packet.metadata.internalReferences?.[0]?.findingId).toBe(row.issueId);
    expect(packet.evidenceLocations?.[String(row.issueId)]).toEqual([
      expect.objectContaining({
        evidenceId: "evidence-last-reported",
        fieldKey: "lastReportedDate",
      }),
    ]);

    const evidenceSnapshot = buildPacketFindingEvidenceLocationSnapshot({
      packet,
      issueId: row.issueId,
      reportArtifactId: row.reportArtifactId,
      reportArtifactData: row.reportArtifactData,
      technicalDetails: row.issueTechnicalDetails,
    });
    expect(evidenceSnapshot).toEqual([
      expect.objectContaining({
        evidenceId: "evidence-last-reported",
        fieldKey: "lastReportedDate",
        sourceField: "sourceReportArtifactId",
        pageNumber: 4,
        ruleId: "BALANCE_CALCULATION_VIOLATION",
      }),
    ]);
  });

  it("keeps readiness and ownership checks tied to the selected finding", () => {
    const row = sourceRow();
    const issue = {
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
      [issue],
    );
    expect(readiness).toMatchObject({
      packetReady: true,
      blockers: [],
      warnings: [],
      eligibleFindingIds: [111],
      reasonCodes: [],
    });

    const nonOwnerReadiness = evaluatePacketReadinessForIssues(
      nonOwner,
      { packetType: "credit_bureau", selectedIssueIds: [row.issueId], recipientBureauId: 33 },
      [issue],
    );
    expect(nonOwnerReadiness.packetReady).toBe(false);
    expect(nonOwnerReadiness.reasonCodes).toContain("UNAUTHORIZED_FINDING");
    expect(nonOwnerReadiness.eligibleFindingIds).toEqual([]);
    expect(nonOwnerReadiness.ineligibleFindingIds).toEqual([111]);

    const missingEvidenceReadiness = evaluatePacketReadinessForIssues(
      owner,
      { packetType: "credit_bureau", selectedIssueIds: [row.issueId], recipientBureauId: 33 },
      [{ ...issue, evidenceReference: "Needs manual review" }],
    );
    expect(missingEvidenceReadiness.packetReady).toBe(false);
    expect(missingEvidenceReadiness.warnings).toEqual([]);
    expect(missingEvidenceReadiness.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          findingId: 111,
          code: "MISSING_REQUIRED_EVIDENCE",
        }),
        expect.objectContaining({
          findingId: 111,
          code: "MANUAL_REVIEW_REQUIRED",
        }),
      ]),
    );
    expect(missingEvidenceReadiness.reasonCodes).toEqual(
      expect.arrayContaining(["MISSING_REQUIRED_EVIDENCE", "MANUAL_REVIEW_REQUIRED"]),
    );
  });
});
