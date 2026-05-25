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
  /raw reference|tradeline|artifact|report artifact|source report|field:|rule id|metadata|PIPEDA_|BALANCE_CALCULATION_VIOLATION|PAYMENT_HISTORY_REVIEW|applicable reporting requirements from credit report item|applicable reporting reference from credit report item|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z|LasReportedDate|Lastreporteddate|lastReportedDate|sourceReportArtifactId|reportArtifactId|tradelineId|Account ending reau|Expected:\s*Not known|PDF rendering is content-based|render\/cache|render and cache|cache retrieval|cache-miss|internal render|system diagnostic/i;

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

function countOccurrences(text: string, value: string): number {
  return text.split(value).length - 1;
}

function packetFromRows(rows: Array<PacketConsumerDisputedItemSource & PacketInternalReferenceSource>) {
  return buildSimpleDisputePacketContent({
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
    disputedItems: rows.map((row) => buildConsumerDisputedItemInput(row, "credit_bureau")),
    reportArtifactIds: rows.map((row) => row.reportArtifactId),
    generatedByUserId: owner.id,
  });
}

function findingRow(
  overrides: Partial<PacketConsumerDisputedItemSource & PacketInternalReferenceSource>,
): PacketConsumerDisputedItemSource & PacketInternalReferenceSource {
  return {
    ...sourceRow(),
    ...overrides,
    issueTechnicalDetails: {
      ...rawTechnicalDetails,
      ...(typeof overrides.issueTechnicalDetails === "object" && overrides.issueTechnicalDetails
        ? overrides.issueTechnicalDetails as Record<string, unknown>
        : {}),
    },
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
    expect(bodyText).toContain("Specific dispute reason: This account appears to remain on my credit file beyond the appropriate reporting period.");
    expect(bodyText).toContain("Please investigate this item and update my credit file accordingly.");
    expect(bodyText).toContain("Evidence or mismatch reference: Relevant report section for Date last reported on page 4.");
    expect(bodyText).toContain("Aug 21, 2012");
    expect(bodyText).not.toContain("Specific dispute reason: Raw reference");
    expect(packet.disputedItems[0].narrative?.factualBasis).toContain("The report dated May 11, 2026 shows Synthetic Bank.");
    expect(packet.disputedItems[0].narrative?.consumerAssertion).toContain("appropriate reporting period");
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

  it("uses adjudicated consumer intent before raw detector category for packet wording", () => {
    const row = findingRow({
      issueViolationCategory: "BALANCE_CALCULATION_VIOLATION",
      issueDisputeVector: null,
      collectionAgencyName: null,
      isCollectionAccount: true,
      issueTechnicalDetails: {
        fieldName: "collectionAgencyName",
        findingEligibility: {
          findingKind: "dispute_basis",
          consumerDisputeIntent: "INCOMPLETE_COLLECTION_REPORTING",
          consumerLabel: "Incomplete collection reporting",
          formalViolationEligible: false,
          legalConclusionAllowed: false,
        },
      },
    });

    const item = buildConsumerDisputedItemInput(row, "credit_bureau");
    const packet = packetFromRows([row]);
    const bodyText = buildConsumerDisputePacketLetterText(packet);

    expect(item.issueType).toBe("INCOMPLETE_COLLECTION_REPORTING");
    expect(item.requestedAction).toBe("verify collection details");
    expect(bodyText).toContain("Specific dispute reason: I cannot verify who is reporting or collecting this account because identifying information is incomplete.");
    expect(bodyText).not.toContain("The balance being reported does not appear accurate based on my records.");
    expect(bodyText).not.toMatch(/legal violation|statutory violation|confirmed violation|breach of law/i);
  });

  it("keeps readiness warnings and blockers out of consumer letter text", () => {
    const packet = buildSimpleDisputePacketContent({
      packetType: "credit_bureau",
      reportType: "Synthetic Bureau credit report",
      recipient: {
        type: "credit_bureau",
        name: "Synthetic Bureau",
        address: ["200 Bureau Test Street", "Toronto, ON M5J 2N8"],
      },
      consumer: {
        name: "Packet Consumer",
        address: ["100 Consumer Avenue", "Halifax, NS B3J 0A1"],
      },
      disputedItems: [
        {
          creditorCollectorName: "Synthetic Bank",
          accountNumber: "123456789012",
          disputedField: "collectionAgencyName",
          reportedValue: "Not shown",
          expectedValue: "Not known",
          issueType: "INCOMPLETE_COLLECTION_REPORTING",
          evidenceReference: "Source report page 4",
          narrative: {
            disputeIntent: "INCOMPLETE_COLLECTION_REPORTING",
            disputeCategory: "INCOMPLETE_OR_UNVERIFIABLE_COLLECTION_DETAILS",
            cautionLevel: "NEEDS_REVIEW",
            issueSummary: "The collection reporting is incomplete.",
            factualBasis: ["The report does not show the collection agency name."],
            consumerAssertion: "I cannot verify who is reporting or collecting this account.",
            verificationRequests: ["Verify the collection agency identity."],
            requestedRemedies: ["Correct or remove the item if it cannot be verified."],
            evidenceReferences: ["See the collection account entry."],
            readinessWarnings: ["Evidence reference needs manual review before sending."],
            readinessBlockers: ["Parser uncertainty must be resolved."],
          },
        },
      ],
    });

    const bodyText = buildConsumerDisputePacketLetterText(packet);

    expect(packet.disputedItems[0].narrative?.readinessWarnings).toContain("Evidence reference needs manual review before sending.");
    expect(packet.disputedItems[0].narrative?.readinessBlockers).toContain("Parser uncertainty must be resolved.");
    expect(bodyText).not.toContain("Readiness warnings:");
    expect(bodyText).not.toContain("Readiness blockers:");
    expect(bodyText).not.toContain("Evidence reference needs manual review before sending.");
    expect(bodyText).not.toContain("Parser uncertainty must be resolved.");
  });

  it("keeps distinct finding reasons, actions, and evidence visible in final bureau letters", () => {
    const balanceRow = findingRow({
      issueId: 201,
      issueUserExplanation: "The balance shown for Synthetic Bank does not match the payment records I have.",
      issueRecommendedAction: "Please correct the balance to match the verified records or remove the unsupported balance.",
      issueViolationCategory: "BALANCE_CALCULATION_VIOLATION",
      issueTechnicalDetails: {
        fieldName: "currentBalance",
        canonicalField: "currentBalance",
        reportedValue: "$900",
        expectedValue: "$0",
        evidenceLink: {
          fieldName: "currentBalance",
          pageNumber: 5,
          textSnippet: "Synthetic Bank current balance $900",
        },
      },
      balance: "$900",
      currentBalance: "$900",
    });
    const statusRow = findingRow({
      issueId: 202,
      issueUserExplanation: "The account is reported as open even though the account records show it was closed.",
      issueRecommendedAction: "Please update the account status to closed or remove the unsupported status reporting.",
      issueViolationCategory: "ACCOUNT_STATUS_INCONSISTENCY",
      issueTechnicalDetails: {
        fieldName: "accountStatus",
        canonicalField: "accountStatus",
        reportedValue: "Open",
        expectedValue: "Closed",
        evidenceLink: {
          fieldName: "accountStatus",
          pageNumber: 6,
          textSnippet: "Synthetic Bank account status Open",
        },
      },
      status: "Open",
      dateClosed: new Date("2024-02-01T00:00:00.000Z"),
    });

    const letter = buildConsumerDisputePacketLetterText(packetFromRows([balanceRow, statusRow]));

    expect(countOccurrences(letter, "Why I am disputing this item:")).toBe(2);
    expect(letter).toContain("Specific dispute reason: The balance being reported does not appear accurate based on my records.");
    expect(letter).toContain("Requested bureau action: Please correct the balance to match the verified records or remove the unsupported balance.");
    expect(letter).toContain("Evidence or mismatch reference: Relevant report section for Balance reported on page 5.");
    expect(letter).toContain("Specific dispute reason: The account status being reported does not appear to match the account records.");
    expect(letter).toContain("Requested bureau action: Please update the account status to closed or remove the unsupported status reporting.");
    expect(letter).toContain("Evidence or mismatch reference: Relevant report section for Account Status on page 6.");
    expect(letter).not.toMatch(forbiddenConsumerPacketOutput);
  });

  it("uses a safe account-and-issue fallback for unknown finding types", () => {
    const unknownRow = findingRow({
      issueId: 203,
      issueUserExplanation: null,
      issueRecommendedAction: null,
      issueViolationCategory: null,
      issueDisputeVector: "SYNTHETIC_UNKNOWN_FINDING",
      creditorName: "Mystery Lender",
      issueTechnicalDetails: {
        fieldName: "account information",
        reportedValue: "Information under review",
        evidenceLink: {
          fieldName: "account information",
          pageNumber: 3,
        },
      },
    });

    const letter = buildConsumerDisputePacketLetterText(packetFromRows([unknownRow]));

    expect(letter).toContain("Account reviewed: Mystery Lender: Missing account identifier");
    expect(letter).toContain("Specific dispute reason: The account number is not shown on my report, so I am asking the bureau to verify the account before it continues to be reported.");
    expect(letter).toContain("Requested bureau action: Please verify the account identifier and supporting records, and correct or remove the item if it cannot be verified.");
    expect(letter).toContain("Evidence or mismatch reference: Relevant report section for Account Information on page 3.");
    expect(letter).not.toMatch(forbiddenConsumerPacketOutput);
  });

  it("uses field-aware requested action fallbacks when raw scanner actions are rejected", () => {
    const paymentHistoryRow = findingRow({
      issueId: 204,
      issueUserExplanation: "Raw reference PIPEDA_4_5 from source report #77 field: paymentHistory.",
      issueRecommendedAction: "rule id PAYMENT_HISTORY_REVIEW metadata expected: Not known",
      issueViolationCategory: "PAYMENT_HISTORY_MANIPULATION",
      issueTechnicalDetails: {
        fieldName: "paymentHistory",
        canonicalField: "paymentHistory",
        reportedValue: "30 days late",
        expectedValue: "Paid as agreed",
        deterministicRule: {
          ruleId: "PAYMENT_HISTORY_REVIEW",
        },
        evidenceLink: {
          fieldName: "paymentHistory",
          pageNumber: 8,
          textSnippet: "Synthetic Bank payment history shows 30 days late",
        },
      },
    });
    const balanceRow = findingRow({
      issueId: 205,
      issueUserExplanation: "The balance shown for Synthetic Bank does not match my payment records.",
      issueRecommendedAction: "rule id BALANCE_CALCULATION_VIOLATION metadata expected: Not known",
      issueViolationCategory: "BALANCE_CALCULATION_VIOLATION",
      issueTechnicalDetails: {
        fieldName: "currentBalance",
        canonicalField: "currentBalance",
        reportedValue: "$900",
        expectedValue: "$0",
        evidenceLink: {
          fieldName: "currentBalance",
          pageNumber: 5,
          textSnippet: "Synthetic Bank current balance $900",
        },
      },
      balance: "$900",
      currentBalance: "$900",
    });
    const safeActionRow = findingRow({
      issueId: 206,
      issueUserExplanation: "The payment history shown for Synthetic Bank does not match my payment records.",
      issueRecommendedAction: "Please correct the payment history to match verified payment records or remove the unsupported late-payment reporting.",
      issueViolationCategory: "PAYMENT_HISTORY_MANIPULATION",
      issueTechnicalDetails: {
        fieldName: "paymentHistory",
        canonicalField: "paymentHistory",
        reportedValue: "30 days late",
        expectedValue: "Paid as agreed",
        evidenceLink: {
          fieldName: "paymentHistory",
          pageNumber: 8,
          textSnippet: "Synthetic Bank payment history shows 30 days late",
        },
      },
    });

    const paymentPacket = packetFromRows([paymentHistoryRow]);
    const paymentLetter = buildConsumerDisputePacketLetterText(paymentPacket);
    const balanceLetter = buildConsumerDisputePacketLetterText(packetFromRows([balanceRow]));
    const safeActionLetter = buildConsumerDisputePacketLetterText(packetFromRows([safeActionRow]));

    expect(paymentPacket.disputedItems[0].requestedAction).toBe("correct payment history");
    expect(paymentPacket.disputedItems[0].findingRecommendedAction).toBeNull();
    expect(paymentLetter).toContain("Specific dispute reason: The payment history being reported does not appear to match my records.");
    expect(paymentLetter).toContain("Requested bureau action: Please investigate the reported payment history and correct it, or remove the item if it cannot be verified.");
    expect(paymentLetter).toContain("Evidence or mismatch reference: Relevant report section for Payment History on page 8.");
    expect(paymentLetter).not.toContain("reported balance");
    expect(paymentLetter).not.toMatch(forbiddenConsumerPacketOutput);
    expect(balanceLetter).toContain("Requested bureau action: Please investigate the reported balance and correct it, or remove the item if it cannot be verified.");
    expect(safeActionLetter).toContain("Requested bureau action: Please correct the payment history to match verified payment records or remove the unsupported late-payment reporting.");
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
