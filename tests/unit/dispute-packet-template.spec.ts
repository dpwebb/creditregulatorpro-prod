import { describe, expect, it } from "vitest";

import {
  buildConsumerDisputePacketLetterText,
  buildSimpleDisputePacketContent,
  maskAccountNumber,
} from "../../helpers/disputePacketTemplate";
import { evaluatePacketReadinessForIssues } from "../../helpers/disputePacketService";

const forbiddenConsumerPacketOutput =
  /tradeline|artifact|report artifact|source report #|field:|PIPEDA_4_5|BALANCE_CALCULATION_VIOLATION|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z|LasReportedDate|Lastreporteddate|lastReportedDate|sourceReportArtifactId|reportArtifactId|tradelineId|Account ending reau|Expected:\s*Not known|PDF rendering is content-based|render\/cache|render and cache|cache retrieval|cache-miss|internal render|system diagnostic/i;

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
    expect(letterBody).toContain("Re: Request to investigate and correct credit report information");
    expect(letterBody).toContain("Disputed Account");
    expect(letterBody).toContain("Company reporting the account: Sample Bank");
    expect(letterBody).toContain("Account: Account ending 9012");
    expect(letterBody).toContain("Information disputed: Balance reported");
    expect(letterBody).toContain("Reported value: $900");
    expect(letterBody).toContain("Expected value: $0");
    expect(letterBody).toContain("Reason for dispute:");
    expect(letterBody).toContain("Requested action:");
    expect(letterBody).toContain("Please investigate this item with the company that supplied the information");
    expect(letterBody).toContain("Sincerely,");
    expect(letterBody).not.toMatch(forbiddenConsumerPacketOutput);
    expect(serialized).not.toContain("123456789012");
    expect(serialized).not.toContain("123 456 789");
    expect(serialized).toContain("SIN: [masked]");
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
    expect(packet.disputedItems[0].requestedAction).toBe("clarify collection authority/details");
    expect(packet.openingParagraph).toMatch(/credit report/i);
    const letterBody = buildConsumerDisputePacketLetterText(packet);

    expect(letterBody).toContain("Requested action:");
    expect(letterBody).toContain(
      "Please provide documentation showing your authority to collect or report this account",
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

    expect(letterBody).toContain("TransUnion credit report");
    expect(letterBody).toContain("Report date: Aug 21, 2012");
    expect(letterBody).toContain("Disputed Account");
    expect(letterBody).toContain("Company reporting the account: Sample Bank");
    expect(letterBody).toContain("Date last reported");
    expect(letterBody).toContain("Information disputed: Date last reported");
    expect(letterBody).toContain("Reported value: Aug 21, 2012");
    expect(letterBody).toContain("Account: Account identifier unavailable");
    expect(letterBody).toContain("Requested result: Verify the correct information");
    expect(letterBody).toContain("Requested action:");
    expect(letterBody).toContain("Please investigate this item");
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
