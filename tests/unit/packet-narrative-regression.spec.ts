import { describe, expect, it } from "vitest";

import { buildPacketNarrative } from "../../helpers/packetNarrative";
import {
  buildConsumerDisputePacketLetterText,
  buildSimpleDisputePacketContent,
  type PacketNarrative,
} from "../../helpers/disputePacketTemplate";
import { evaluatePacketReadinessForIssues } from "../../helpers/disputePacketService";

const GENERIC_REASON =
  "I am asking you to verify whether this information is accurate, complete, and supported by the records used to report this account.";
const FULL_INTERNAL_HASH = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function countOccurrences(text: string, value: string): number {
  return text.split(value).length - 1;
}

function buildPacketWithNarrative(
  narrative: PacketNarrative,
  overrides: Partial<Parameters<typeof buildSimpleDisputePacketContent>[0]["disputedItems"][number]> = {},
) {
  const packet = buildSimpleDisputePacketContent({
    packetType: "credit_bureau",
    reportType: "TransUnion Canada credit report",
    reportDate: "2026-01-10T00:00:00.000Z",
    dateGenerated: "2026-05-23T00:00:00.000Z",
    recipient: {
      type: "credit_bureau",
      name: "TransUnion Canada",
      address: ["Consumer Relations"],
    },
    consumer: {
      name: "TEST CONSUMER",
      address: ["1 Test Street", "Halifax, NS A1A 1A1"],
    },
    disputedItems: [
      {
        issueId: 7001,
        tradelineId: 8001,
        creditorCollectorName: "Telecom Provider",
        accountNumber: null,
        disputedField: "Date last reported",
        reportedValue: "2012-08-21T00:00:00.000Z",
        expectedValue: "Not known",
        issueType: "DATE_REPORTING",
        explanation: GENERIC_REASON,
        evidenceReference: "Synthetic credit report page 4; field: Date last reported",
        narrative,
        ...overrides,
      },
    ],
    reportArtifactIds: [9001],
    generatedByUserId: 3001,
  });

  packet.metadata.internalReferences = [
    {
      findingId: 7001,
      violationId: 7001,
      tradelineId: 8001,
      reportArtifactId: 9001,
      evidenceIds: [FULL_INTERNAL_HASH],
      regulationIds: [],
      ruleIds: ["SYNTHETIC_PACKET_NARRATIVE_RULE"],
      fieldKey: "lastReportedDate",
      sourceField: "synthetic.lastReportedDate",
      readiness: { packetReady: true, findingEligible: true },
    },
  ];

  return packet;
}

describe("packet narrative regression matrix", () => {
  it("builds cautious old Date last reported narrative without duplicating generic reasons or exposing hashes", () => {
    const narrative = buildPacketNarrative({
      packetType: "credit_bureau",
      issueId: 7001,
      tradelineId: 8001,
      reportArtifactId: 9001,
      reportType: "TransUnion Canada credit report",
      reportDate: "2026-01-10T00:00:00.000Z",
      bureauName: "TransUnion Canada",
      accountName: "Telecom Provider",
      accountNumber: null,
      accountStatus: null,
      amountPastDue: null,
      isCollectionAccount: null,
      disputedField: "Date last reported",
      reportedValue: "2012-08-21T00:00:00.000Z",
      expectedValue: "Not known",
      issueType: "DATE_REPORTING",
      evidenceReference: "Synthetic credit report page 4; field: Date last reported",
      evidencePageNumber: 4,
      evidenceIds: [FULL_INTERNAL_HASH],
    });
    const packet = buildPacketWithNarrative(narrative);
    const letter = buildConsumerDisputePacketLetterText(packet);

    expect(narrative).toMatchObject({
      disputeCategory: "POSSIBLE_OBSOLETE_OR_STALE_REPORTING",
      cautionLevel: "CAUTIOUS",
      internalReference: expect.stringContaining(FULL_INTERNAL_HASH),
    });
    expect(letter).toContain("credit report dated Jan 10, 2026");
    expect(letter).toContain("Telecom Provider");
    expect(letter).toMatch(/Date last reported/i);
    expect(letter).toContain("Aug 21, 2012");
    expect(letter).toContain("Account Number: Account number not shown on report");
    expect(letter).toContain("Date Reported / Last Activity: Date last reported: Aug 21, 2012");
    expect(letter).toContain("This account appears to remain on my credit file beyond the appropriate reporting period.");
    expect(letter).toContain("Please investigate this item and update my credit file accordingly.");
    expect(narrative.factualBasis).toContain("Account number not shown on report; see attached report page.");
    expect(narrative.consumerAssertion).toBe("This account appears to remain on my credit file beyond the appropriate reporting period.");
    expect(narrative.verificationRequests).toEqual(expect.arrayContaining([
      "Verify the source records supporting the account.",
      "Verify the account identifier or explain why no account number is shown on the report.",
      "Verify the date of first delinquency/default if applicable.",
      "Verify the basis for continuing to publish this item on the current report.",
    ]));
    expect(letter).not.toMatch(/\billegal\b|\bobsolete\b|\btime-barred\b|exceeded the maximum allowed reporting period/i);
    expect(countOccurrences(letter, GENERIC_REASON)).toBeLessThanOrEqual(1);
    expect(letter).not.toMatch(/\b[a-f0-9]{64}\b/i);
    expect(JSON.stringify(packet.metadata)).toContain(FULL_INTERNAL_HASH);
    expect(packet.disputedItems[0].narrative?.internalReference).toContain(FULL_INTERNAL_HASH);
  });

  it("frames missing account identifiers as a report limitation, not consumer omission", () => {
    const narrative = buildPacketNarrative({
      packetType: "credit_bureau",
      issueId: 7002,
      reportArtifactId: 9002,
      reportType: "TransUnion Canada credit report",
      reportDate: "2026-01-10",
      accountName: "Utility Provider",
      accountNumber: null,
      disputedField: "accountNumber",
      reportedValue: "Not shown",
      issueType: "MISSING_ACCOUNT_IDENTIFIER",
      evidenceReference: "Synthetic credit report page 2; field: account status",
      evidencePageNumber: 2,
    });
    const packet = buildPacketWithNarrative(narrative, {
      issueId: 7002,
      tradelineId: 8002,
      creditorCollectorName: "Utility Provider",
      disputedField: "accountNumber",
      reportedValue: "Not shown",
      expectedValue: "Closed",
      issueType: "MISSING_ACCOUNT_IDENTIFIER",
      evidenceReference: "Synthetic credit report page 2; field: account status",
    });
    const letter = buildConsumerDisputePacketLetterText(packet);

    expect(narrative.disputeCategory).toBe("MISSING_ACCOUNT_IDENTIFIER");
    expect(narrative.issueSummary).toContain("The account number is not shown on my report");
    expect(narrative.verificationRequests).toContain("Verify the account identifier or explain why no account number is shown on the report.");
    expect(narrative.verificationRequests).toContain("Verify the source records supporting the account.");
    expect(letter).toContain("Creditor/Reporter: Utility Provider");
    expect(letter).toContain("Account Number: Account number not shown on report");
    expect(letter).toContain("The account number is not shown on my report, so I am asking the bureau to verify the account before it continues to be reported.");
    expect(letter).not.toMatch(/consumer failed to provide|consumer did not provide|you failed to provide/i);
  });

  it("builds a meaningful generic field narrative when evidence is available", () => {
    const narrative = buildPacketNarrative({
      packetType: "credit_bureau",
      issueId: 7003,
      reportArtifactId: 9003,
      reportType: "Equifax Canada credit report",
      reportDate: "2026-03-15",
      bureauName: "Equifax Canada",
      accountName: "Example Bank",
      accountNumber: "123456789012",
      disputedField: "balance",
      reportedValue: "$900",
      expectedValue: "$0",
      issueType: "BALANCE_CALCULATION",
      evidenceReference: "Synthetic credit report page 2; field: balance",
      evidencePageNumber: 2,
    });
    const packet = buildPacketWithNarrative(narrative, {
      issueId: 7003,
      tradelineId: 8003,
      creditorCollectorName: "Example Bank",
      accountNumber: "123456789012",
      disputedField: "balance",
      reportedValue: "$900",
      expectedValue: "$0",
      issueType: "BALANCE_CALCULATION",
      evidenceReference: "Synthetic credit report page 2; field: balance",
    });
    const letter = buildConsumerDisputePacketLetterText(packet);

    expect(narrative.disputeCategory).toBe("BALANCE_OR_STATUS_ACCURACY");
    expect(narrative.issueSummary).toContain("The balance being reported does not appear accurate based on my records.");
    expect(narrative.issueSummary).toContain("The report shows Balance reported: $900.");
    expect(narrative.evidenceReferences).toEqual(expect.arrayContaining([
      "Relevant report section for Balance reported on page 2.",
    ]));
    expect(narrative.verificationRequests).toContain("Verify the balance reported.");
    expect(letter).toContain("Creditor/Reporter: Example Bank");
    expect(letter).toContain("Reported Balance: $900");
    expect(letter).toContain("The balance being reported does not appear accurate based on my records.");
    expect(letter).not.toBe(GENERIC_REASON);
    expect(countOccurrences(letter, GENERIC_REASON)).toBe(0);
  });

  it("surfaces readiness warnings/blockers for insufficient narrative data instead of silently generating a generic dispute", () => {
    const narrative = buildPacketNarrative({
      packetType: "credit_bureau",
      issueId: 7004,
      reportType: "Synthetic credit report",
      reportDate: "2026-01-10",
      accountName: null,
      accountNumber: "555544443333",
      disputedField: null,
      reportedValue: null,
      issueType: null,
      evidenceReference: null,
    });
    const packet = buildPacketWithNarrative(narrative, {
      issueId: 7004,
      tradelineId: 8004,
      creditorCollectorName: null,
      accountNumber: "555544443333",
      disputedField: null,
      reportedValue: null,
      expectedValue: null,
      issueType: null,
      evidenceReference: null,
    });
    const readiness = evaluatePacketReadinessForIssues(
      { id: 3001, role: "user" },
      { packetType: "credit_bureau", selectedIssueIds: [7004] },
      [
        {
          issueId: 7004,
          userId: 3001,
          tradelineId: 8004,
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
          evidenceReference: "Needs manual review",
          packetTypes: ["credit_bureau"],
        },
      ],
    );
    const letter = buildConsumerDisputePacketLetterText(packet);

    expect(narrative.disputeCategory).toBe("FIELD_ACCURACY");
    expect(narrative.cautionLevel).toBe("CAUTIOUS");
    expect(narrative.readinessWarnings).toEqual(expect.arrayContaining([
      "Evidence reference needs manual review before sending.",
    ]));
    expect(narrative.readinessBlockers).toEqual([]);
    expect(readiness.packetReady).toBe(false);
    expect(readiness.reasonCodes).toEqual(expect.arrayContaining([
      "MISSING_REQUIRED_EVIDENCE",
      "MANUAL_REVIEW_REQUIRED",
    ]));
    expect(letter).toContain("I am disputing this item because the information being reported appears inaccurate or incomplete.");
    expect(letter).not.toContain("Readiness warnings:");
    expect(narrative.readinessWarnings).toContain("Evidence reference needs manual review before sending.");
    expect(countOccurrences(letter, GENERIC_REASON)).toBe(0);
  });

  it("keeps long internal references in metadata while excluding them from external letter text", () => {
    const narrative = buildPacketNarrative({
      packetType: "credit_bureau",
      issueId: 7005,
      tradelineId: 8005,
      reportArtifactId: 9005,
      reportType: "TransUnion Canada credit report",
      reportDate: "2026-02-01",
      accountName: "Retail Card Provider",
      accountNumber: "999988887777",
      disputedField: "account status",
      reportedValue: "Open",
      issueType: "ACCOUNT_STATUS_INCONSISTENCY",
      evidenceReference: "Synthetic credit report page 3; field: account status",
      evidencePageNumber: 3,
      evidenceIds: [FULL_INTERNAL_HASH],
    });
    const packet = buildPacketWithNarrative(narrative, {
      issueId: 7005,
      tradelineId: 8005,
      creditorCollectorName: "Retail Card Provider",
      accountNumber: "999988887777",
      disputedField: "account status",
      reportedValue: "Open",
      expectedValue: "Closed",
      issueType: "ACCOUNT_STATUS_INCONSISTENCY",
      evidenceReference: "Synthetic credit report page 3; field: account status",
    });
    const letter = buildConsumerDisputePacketLetterText(packet);

    expect(packet.metadata.internalReferences?.[0]?.evidenceIds).toContain(FULL_INTERNAL_HASH);
    expect(packet.disputedItems[0].narrative?.internalReference).toContain(FULL_INTERNAL_HASH);
    expect(packet.disputedItems[0].narrative?.externalReferenceDisplay).toBe("Issue 7005");
    expect(letter).not.toContain(FULL_INTERNAL_HASH);
    expect(letter).not.toMatch(/\b[a-f0-9]{64}\b/i);
  });
});
