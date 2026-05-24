import { describe, expect, it } from "vitest";

import {
  buildConsumerDisputePacketLetterText,
  buildSimpleDisputePacketContent,
  maskAccountNumber,
} from "../../helpers/disputePacketTemplate";
import { evaluatePacketReadinessForIssues } from "../../helpers/disputePacketService";

const forbiddenConsumerPacketOutput =
  /raw reference|review basis|reference ids|tradeline|artifact|report artifact|source report|field:|rule id|metadata|documentation chain|Documentation Chain Failure|Verification Integrity Failure|Regulatory Reference|Chain Integrity Concern|Metadata concern|correction pathway|PIPEDA_4_5|BALANCE_CALCULATION_VIOLATION|PAYMENT_HISTORY_REVIEW|applicable reporting requirements from credit report item|applicable reporting reference from credit report item|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z|LasReportedDate|Lastreporteddate|lastReportedDate|sourceReportArtifactId|reportArtifactId|tradelineId|Account ending reau|Expected:\s*Not known|PDF rendering is content-based|render\/cache|render and cache|cache retrieval|cache-miss|internal render|system diagnostic/i;

function words(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

describe("simple dispute packet template", () => {
  it("builds a neutral credit bureau packet without direct furnisher instructions", () => {
    const packet = buildSimpleDisputePacketContent({
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
          explanation: "The balance may be inaccurate. SIN 123 456 789 should not appear.",
          findingReason: "The balance shown for Sample Bank does not match my payment records.",
          evidenceReference: "Source report #7; field: balance; page 2",
        },
      ],
      reportArtifactIds: [7],
    });

    const serialized = JSON.stringify(packet);
    const letterBody = buildConsumerDisputePacketLetterText(packet);

    expect(packet.title).toBe("Credit Bureau Dispute Packet");
    expect(packet.disputedItems[0].maskedAccountNumber).toBe("Account ending 9012");
    expect(packet.disputedItems[0].disputedField).toBe("Balance reported");
    expect(packet.disputedItems[0].requestedAction).toBe("correct balance");
    expect(packet.disputedItems[0].evidenceReference).toBe("Relevant report section for Balance reported on page 2.");
    expect(packet.disputedItems[0].evidenceReference).not.toMatch(/artifact|field:|#7/i);
    expect(packet.metadata.reportArtifactIds).toEqual([7]);
    expect(packet.disputedItems[0].explanation).toContain(
      "I am asking you to verify whether this information is accurate, complete, and supported by the records used to report this account.",
    );
    expect(packet.disputedItems[0].explanation).not.toMatch(/company identified|source report|artifact|field:/i);
    expect(packet.disputedItems[0].explanation).not.toMatch(/contact the furnisher/i);
    expect(letterBody).toContain("Subject: Dispute of Credit Report Information");
    expect(letterBody).toContain("To Whom It May Concern,");
    expect(letterBody).toContain("credit report dated Apr 15, 2026");
    expect(letterBody).toContain("The account in question is:");
    expect(letterBody).toContain("Creditor/Reporter: Sample Bank");
    expect(letterBody).toContain("Account Number: Account ending 9012");
    expect(letterBody).toContain("Reported Balance: $900");
    expect(letterBody).toContain("Specific dispute reason: The balance being reported does not appear accurate based on my records.");
    expect(letterBody).toContain("The balance being reported does not appear accurate based on my records.");
    expect(letterBody).toContain("Please investigate this item and update my credit file accordingly.");
    expect(letterBody).toContain("Sincerely,");
    expect(letterBody).not.toContain("Re: Request to investigate and correct credit report information");
    expect(letterBody).not.toContain("Disputed Account");
    expect(letterBody).not.toContain("Requested action:");
    expect(letterBody).not.toContain("Date Reported / Last Activity: Balance reported: $900");
    expect(letterBody).not.toMatch(forbiddenConsumerPacketOutput);
    expect(serialized).not.toContain("123456789012");
    expect(serialized).not.toContain("123 456 789");
    expect(serialized).toContain("SIN: [masked]");
  });

  it("rejects raw scanner references as consumer-facing dispute reasons", () => {
    const packet = buildSimpleDisputePacketContent({
      packetType: "credit_bureau",
      reportType: "TransUnion credit report",
      reportDate: "2026-04-15",
      recipient: {
        type: "credit_bureau",
        name: "TransUnion Canada",
        address: ["Consumer Relations"],
      },
      consumer: {
        name: "Test Consumer",
        address: ["1 Main St"],
      },
      disputedItems: [
        {
          creditorCollectorName: "Sample Bank",
          accountNumber: "123456789012",
          disputedField: "lastReportedDate",
          reportedValue: "2012-08-21T00:00:00.000Z",
          expectedValue: "Not known",
          issueType: "TEMPORAL_MANIPULATION",
          findingReason: "Raw reference PIPEDA_4_5 from source report #77 field: lastReportedDate.",
          findingRecommendedAction: "rule id BALANCE_CALCULATION_VIOLATION metadata expected: Not known",
          evidenceReference: "Source report page 2",
        },
      ],
    });

    const letterBody = buildConsumerDisputePacketLetterText(packet);

    expect(letterBody).toContain("Specific dispute reason: The account dates being reported do not appear consistent with the account history.");
    expect(letterBody).toContain("Evidence or mismatch reference: Relevant report section for Date last reported on page 2.");
    expect(letterBody).not.toContain("Specific dispute reason: Raw reference");
    expect(letterBody).not.toMatch(forbiddenConsumerPacketOutput);
  });

  it("maps internal analytic labels to consumer dispute intent", () => {
    const packet = buildSimpleDisputePacketContent({
      packetType: "credit_bureau",
      reportType: "TransUnion credit report",
      reportDate: "2026-04-15",
      recipient: {
        type: "credit_bureau",
        name: "TransUnion Canada",
        address: ["Consumer Relations"],
      },
      consumer: {
        name: "Test Consumer",
        address: ["1 Main St"],
      },
      disputedItems: [
        {
          creditorCollectorName: "Sample Bank",
          accountNumber: "123456789012",
          disputedField: "originalCreditorName",
          reportedValue: "Not shown",
          expectedValue: "Not known",
          issueType: "DOCUMENTATION_CHAIN_FAILURE",
          findingReason: "Documentation Chain Failure; Regulatory Reference PIPEDA_4_6; Chain Integrity Concern; Metadata concern.",
          evidenceReference: "Source report page 2",
        },
      ],
    });

    const letterBody = buildConsumerDisputePacketLetterText(packet);

    expect(packet.disputedItems[0].issueType).toBe("Unsupported reporting");
    expect(letterBody).toContain("Account reviewed: Sample Bank: Unsupported reporting");
    expect(letterBody).not.toMatch(forbiddenConsumerPacketOutput);
  });

  it("renders field-aware requested action fallbacks", () => {
    const packet = buildSimpleDisputePacketContent({
      packetType: "credit_bureau",
      reportType: "TransUnion credit report",
      recipient: {
        type: "credit_bureau",
        name: "TransUnion Canada",
        address: ["Consumer Relations"],
      },
      consumer: {
        name: "Test Consumer",
        address: ["1 Main St"],
      },
      disputedItems: [
        {
          creditorCollectorName: "Sample Bank",
          accountNumber: null,
          disputedField: "paymentHistory",
          reportedValue: "30 days late",
          expectedValue: "Paid as agreed",
          issueType: "PAYMENT_HISTORY_MANIPULATION",
          findingRecommendedAction: "rule id PAYMENT_HISTORY_REVIEW metadata expected: Not known",
          evidenceReference: "Source report page 8",
        },
        {
          creditorCollectorName: "Sample Bank",
          accountNumber: null,
          disputedField: "currentBalance",
          reportedValue: "$900",
          expectedValue: "$0",
          issueType: "BALANCE_CALCULATION_VIOLATION",
          evidenceReference: "Source report page 5",
        },
        {
          creditorCollectorName: "Sample Bank",
          accountNumber: null,
          disputedField: "accountStatus",
          reportedValue: "Open",
          expectedValue: "Closed",
          issueType: "ACCOUNT_STATUS_INCONSISTENCY",
          evidenceReference: "Source report page 6",
        },
        {
          creditorCollectorName: "Sample Bank",
          accountNumber: null,
          disputedField: "lastReportedDate",
          reportedValue: "2026-04-10T00:00:00.000Z",
          expectedValue: "Not known",
          issueType: "TEMPORAL_MANIPULATION",
          evidenceReference: "Source report page 7",
        },
      ],
    });

    const letterBody = buildConsumerDisputePacketLetterText(packet);

    expect(packet.disputedItems[0].requestedAction).toBe("correct payment history");
    expect(packet.disputedItems[0].findingRecommendedAction).toBeNull();
    expect(packet.disputedItems[1].requestedAction).toBe("correct balance");
    expect(packet.disputedItems[2].requestedAction).toBe("correct account status");
    expect(packet.disputedItems[3].requestedAction).toBe("correct date");
    expect(letterBody).toContain("Requested bureau action: Please investigate the reported payment history and correct it, or remove the item if it cannot be verified.");
    expect(letterBody).toContain("Requested bureau action: Please investigate the reported balance and correct it, or remove the item if it cannot be verified.");
    expect(letterBody).toContain("Requested bureau action: Please investigate the account status and correct it, or remove the item if it cannot be verified.");
    expect(letterBody).toContain("Requested bureau action: Please investigate the reported date information and correct it, or remove the item if it cannot be verified.");
    expect(letterBody).not.toMatch(forbiddenConsumerPacketOutput);
  });

  it("renders distinct concise narratives from canonical dispute intents", () => {
    const packet = buildSimpleDisputePacketContent({
      packetType: "credit_bureau",
      reportType: "TransUnion credit report",
      recipient: {
        type: "credit_bureau",
        name: "TransUnion Canada",
        address: ["Consumer Relations"],
      },
      consumer: {
        name: "Test Consumer",
        address: ["1 Main St"],
      },
      disputedItems: [
        {
          creditorCollectorName: "Sample Collections",
          accountNumber: null,
          disputedField: "collectionAgencyName",
          reportedValue: "Not shown",
          expectedValue: "Not known",
          issueType: "MISSING_COLLECTION_AGENCY_NAME",
          evidenceReference: "Source report page 2",
        },
        {
          creditorCollectorName: "Sample Bank",
          accountNumber: "123456789012",
          disputedField: "paymentHistory",
          reportedValue: "30 days late",
          expectedValue: "Paid as agreed",
          issueType: "PAYMENT_HISTORY_CONFLICT",
          evidenceReference: "Source report page 3",
        },
        {
          creditorCollectorName: "Old Account",
          accountNumber: "999988887777",
          disputedField: "lastReportedDate",
          reportedValue: "2012-08-21",
          expectedValue: "Not known",
          issueType: "DATE_OBSOLESCENCE",
          evidenceReference: "Source report page 4",
        },
      ],
    });

    const letterBody = buildConsumerDisputePacketLetterText(packet);
    const reasons = letterBody
      .split("\n")
      .filter((line) => line.startsWith("Specific dispute reason: "))
      .map((line) => line.replace("Specific dispute reason: ", ""));

    expect(reasons).toEqual([
      "I cannot verify who is reporting or collecting this account because identifying information is incomplete.",
      "The payment history being reported does not appear to match my records.",
      "This account appears to remain on my credit file beyond the appropriate reporting period.",
    ]);
    expect(reasons.every((reason) => words(reason) <= 18)).toBe(true);
    expect(packet.disputedItems.map((item) => item.requestedAction)).toEqual([
      "verify collection details",
      "correct payment history",
      "update stale information",
    ]);
    expect(letterBody).toContain("Evidence or mismatch reference: Relevant report section for Company reporting the account on page 2.");
    expect(letterBody).toContain("Evidence or mismatch reference: Relevant report section for Payment History on page 3.");
    expect(letterBody).toContain("Evidence or mismatch reference: Relevant report section for Date last reported on page 4.");
    expect(letterBody).not.toMatch(forbiddenConsumerPacketOutput);
  });

  it("keeps non-violation dispute signals investigatory without statutory conclusions", () => {
    const packet = buildSimpleDisputePacketContent({
      packetType: "credit_bureau",
      reportType: "Equifax credit report",
      recipient: {
        type: "credit_bureau",
        name: "Equifax Canada",
        address: ["National Consumer Relations"],
      },
      consumer: {
        name: "Test Consumer",
        address: ["1 Main St"],
      },
      disputedItems: [
        {
          creditorCollectorName: "Sample Bank",
          accountNumber: "123456789012",
          disputedField: "originalCreditorName",
          reportedValue: "Not shown",
          expectedValue: "Not known",
          issueType: "UNSUPPORTED_REPORTING",
          findingReason: "Review basis: documentation chain failure; reference ids PIPEDA_4_6; metadata concern.",
          evidenceReference: "Source report page 5",
        },
      ],
    });

    const letterBody = buildConsumerDisputePacketLetterText(packet);

    expect(letterBody).toContain("Specific dispute reason: I am asking the bureau to verify that this account is supported by records before it continues to be reported.");
    expect(letterBody).toContain("Requested bureau action: Please remove this information if the records supporting it cannot be verified.");
    expect(letterBody).toContain("Evidence or mismatch reference: Relevant report section for Company reporting the account on page 5.");
    expect(letterBody).not.toMatch(/statutory violation|legal violation|confirmed violation|violates?|breach of law/i);
    expect(letterBody).not.toMatch(forbiddenConsumerPacketOutput);
  });

  it("does not duplicate the default credit bureau verification sentence", () => {
    const verificationSentence =
      "I am asking you to verify whether this information is accurate, complete, and supported by the records used to report this account.";
    const packet = buildSimpleDisputePacketContent({
      packetType: "credit_bureau",
      reportType: "TransUnion credit report",
      recipient: {
        type: "credit_bureau",
        name: "TransUnion Canada",
        address: ["Consumer Relations"],
      },
      consumer: {
        name: "Test Consumer",
        address: ["1 Main St"],
      },
      disputedItems: [
        {
          creditorCollectorName: "Sample Bank",
          accountNumber: null,
          disputedField: "lastReportedDate",
          reportedValue: "2012-08-21T00:00:00.000Z",
          expectedValue: "Not known",
          issueType: "TEMPORAL_MANIPULATION",
          explanation: verificationSentence,
          evidenceReference: "Source report page 2",
        },
      ],
    });

    const explanation = packet.disputedItems[0].explanation;
    expect(explanation.match(new RegExp(verificationSentence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))).toHaveLength(1);
  });

  it("deduplicates repeated packet narrative sentences while the external bureau letter stays plain", () => {
    const packet = buildSimpleDisputePacketContent({
      packetType: "credit_bureau",
      reportType: "TransUnion credit report",
      recipient: {
        type: "credit_bureau",
        name: "TransUnion Canada",
        address: ["Consumer Relations"],
      },
      consumer: {
        name: "Test Consumer",
        address: ["1 Main St"],
      },
      disputedItems: [
        {
          creditorCollectorName: "Sample Bank",
          accountNumber: null,
          disputedField: "account status",
          reportedValue: "Open",
          expectedValue: "Closed",
          issueType: "ACCOUNT_STATUS_INCONSISTENCY",
          evidenceReference: "Source report page 2",
          narrative: {
            disputeCategory: "BALANCE_OR_STATUS_ACCURACY",
            cautionLevel: "NORMAL",
            issueSummary: "The report shows Sample Bank with account status: Open.",
            factualBasis: [
              "The report shows account status: Open.",
              "The report shows account status: Open.",
            ],
            consumerAssertion: "I dispute the accuracy, completeness, support, and continued reportability of this item.",
            verificationRequests: [
              "Verify the account status.",
              "Verify the account status.",
            ],
            requestedRemedies: [
              "Correct any inaccurate or incomplete information.",
              "Correct any inaccurate or incomplete information.",
            ],
            evidenceReferences: ["See attached report page.", "See attached report page."],
            readinessWarnings: [],
            readinessBlockers: [],
            internalReference: "finding:1|evidence:raw-internal-id",
            externalReferenceDisplay: "Issue 1",
          },
        },
      ],
    });

    const letterBody = buildConsumerDisputePacketLetterText(packet);

    expect(packet.disputedItems[0].narrative?.verificationRequests).toEqual(["Verify the account status."]);
    expect(letterBody).toContain("The account status being reported does not appear to match the account records.");
    expect(letterBody.match(/Verify the account status\./g) ?? []).toHaveLength(0);
    expect(letterBody.match(/Correct any inaccurate or incomplete information\./g) ?? []).toHaveLength(0);
    expect(letterBody).not.toContain("Reason for dispute:");
    expect(letterBody).not.toContain("raw-internal-id");
  });

  it("builds a collection agency clarification packet", () => {
    const packet = buildSimpleDisputePacketContent({
      packetType: "collection_agency",
      reportType: "Collection agency account information",
      recipient: {
        type: "collection_agency",
        name: "Sample Collections",
        address: ["10 Agency Rd", "Toronto, ON M5H 1A1"],
      },
      consumer: {
        name: "Test Consumer",
        address: ["1 Main St", "Halifax, NS B3H 0A1"],
      },
      disputedItems: [
        {
          creditorCollectorName: "Sample Collections",
          sourceFurnisherName: "Original Creditor",
          accountNumber: "COLL-998877",
          disputedField: "collection authority/details",
          reportedValue: "Collection account",
          expectedValue: "Clarification requested",
          issueType: "COLLECTOR_LICENSE_FAILURE",
          evidenceReference: "Source report #8; field: collection agency",
        },
      ],
    });

    expect(packet.title).toBe("Collection Agency Clarification/Dispute Packet");
    expect(packet.disputedItems[0].requestedAction).toBe("verify collection details");
    expect(packet.openingParagraph).toMatch(/credit report/i);
    const letterBody = buildConsumerDisputePacketLetterText(packet);

    expect(letterBody).toContain("Requested action:");
    expect(letterBody).toContain(
      "Please verify the account details and supporting records",
    );
    expect(letterBody).not.toMatch(forbiddenConsumerPacketOutput);
  });

  it("marks unsupported items for manual review", () => {
    const packet = buildSimpleDisputePacketContent({
      packetType: "credit_bureau",
      reportType: "Equifax credit report",
      recipient: {
        type: "credit_bureau",
        name: "Equifax Canada",
        address: ["National Consumer Relations"],
      },
      consumer: {
        name: "Test Consumer",
        address: ["1 Main St"],
      },
      disputedItems: [
        {
          creditorCollectorName: "Sample Bank",
          accountNumber: "999988887777",
          disputedField: "account status",
          reportedValue: "Open",
          expectedValue: null,
          issueType: "ACCOUNT_STATUS_INCONSISTENCY",
          evidenceReference: null,
        },
      ],
    });

    expect(packet.disputedItems[0].needsManualReview).toBe(true);
    expect(packet.disputedItems[0].evidenceReference).toBe("Needs manual review");
    expect(packet.attachmentChecklist.join(" ")).toMatch(/Manual evidence review/i);
  });

  it("masks account numbers consistently", () => {
    expect(maskAccountNumber("123456789")).toBe("Account ending 6789");
    expect(maskAccountNumber("")).toBe("Account number not provided on report");
    expect(maskAccountNumber("not reported")).toBe("Account number not provided on report");
    expect(maskAccountNumber("reau")).toBe("Account identifier unavailable");
  });

  it("builds consumer-facing letter text without internal identifiers", () => {
    const packet = buildSimpleDisputePacketContent({
      packetType: "credit_bureau",
      reportType: "TransUnion report artifact #77",
      reportDate: "2012-08-21T00:00:00.000Z",
      recipient: {
        type: "credit_bureau",
        name: "TransUnion Canada",
        address: ["Consumer Relations"],
      },
      consumer: {
        name: "Test Consumer",
        address: ["1 Main St"],
        email: "test@example.com",
      },
      disputedItems: [
        {
          issueId: 111,
          tradelineId: 222,
          creditorCollectorName: "Sample Bank",
          accountNumber: "reau",
          disputedField: "LasReportedDate",
          reportedValue: "2012-08-21T00:00:00.000Z",
          expectedValue: "Not known",
          issueType: "BALANCE_CALCULATION_VIOLATION",
          explanation: "PIPEDA_4_5 source report #77 field: Lastreporteddate tradelineId: 222",
          evidenceReference: "reportArtifactId: 77; tradelineId: 222; field: lastReportedDate; page 4",
        },
      ],
      reportArtifactIds: [77],
      generatedByUserId: 333,
    });

    packet.metadata.internalReferences = [
      {
        findingId: 111,
        violationId: 111,
        tradelineId: 222,
        reportArtifactId: 77,
        evidenceIds: ["evidence-77"],
        regulationIds: ["PIPEDA_4_5"],
        ruleIds: ["BALANCE_CALCULATION_VIOLATION"],
        fieldKey: "lastReportedDate",
        sourceField: "tradelines[0].lastReportedDate",
        readiness: { packetReady: true, findingEligible: true },
      },
    ];

    const letterBody = buildConsumerDisputePacketLetterText(packet);
    const readiness = evaluatePacketReadinessForIssues(
      { id: 333, role: "user" },
      { packetType: "credit_bureau", selectedIssueIds: [111] },
      [
        {
          issueId: 111,
          userId: 333,
          tradelineId: 222,
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
          evidenceReference: packet.disputedItems[0].evidenceReference,
          packetTypes: ["credit_bureau"],
        },
      ],
    );

    expect(letterBody).toContain("Subject: Dispute of Credit Report Information");
    expect(letterBody).toContain("credit report dated Aug 21, 2012");
    expect(letterBody).toContain("Creditor/Reporter: Sample Bank");
    expect(letterBody).toContain("Date last reported");
    expect(letterBody).toContain("Date Reported / Last Activity: Date last reported: Aug 21, 2012");
    expect(letterBody).toContain("Account Number: Account number not shown on report");
    expect(letterBody).toContain("Specific dispute reason: The balance being reported does not appear accurate based on my records.");
    expect(letterBody).toContain("Please investigate this item");
    expect(letterBody).not.toContain("TransUnion report artifact");
    expect(letterBody).not.toContain("Requested result: Verify the correct information");
    expect(letterBody).not.toContain("Requested action:");
    expect(letterBody).not.toMatch(/account ending reau/i);
    expect(letterBody).not.toMatch(forbiddenConsumerPacketOutput);
    expect(packet.metadata.reportArtifactIds).toEqual([77]);
    expect(packet.metadata.selectedIssueIds).toEqual([111]);
    expect(packet.metadata.internalReferences?.[0]).toMatchObject({
      reportArtifactId: 77,
      tradelineId: 222,
      regulationIds: ["PIPEDA_4_5"],
      ruleIds: ["BALANCE_CALCULATION_VIOLATION"],
      fieldKey: "lastReportedDate",
    });
    expect(packet.disputedItems[0].tradelineId).toBe(222);
    expect(packet.disputedItems[0].requestedAction).toBe("correct balance");
    expect(readiness.packetReady).toBe(true);
    expect(readiness.reasonCodes).toEqual([]);
  });
});
