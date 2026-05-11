import { describe, expect, it } from "vitest";

import {
  buildSimpleDisputePacketContent,
  maskAccountNumber,
} from "../../helpers/disputePacketTemplate";

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

    expect(packet.title).toBe("Credit Bureau Dispute Packet");
    expect(packet.disputedItems[0].maskedAccountNumber).toBe("Account ending 9012");
    expect(packet.disputedItems[0].requestedAction).toBe("correct balance");
    expect(packet.disputedItems[0].evidenceReference).toContain("Source report #7");
    expect(packet.disputedItems[0].explanation).toContain("supplied by Sample Bank");
    expect(packet.disputedItems[0].explanation).not.toMatch(/contact the furnisher/i);
    expect(serialized).not.toContain("123456789012");
    expect(serialized).not.toContain("123 456 789");
    expect(serialized).toContain("SIN: [masked]");
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
    expect(packet.openingParagraph).toMatch(/clear review/i);
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
    expect(maskAccountNumber("")).toBe("Account number not provided");
    expect(maskAccountNumber("not reported")).toBe("Account number not provided");
  });
});
