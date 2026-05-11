import { describe, expect, it } from "vitest";

import {
  applyRecipientOverrideToPacketContent,
  generatePacketContentPdfBase64,
} from "../../helpers/packetPdfContent";
import { generateDisputePacketPDF } from "../../helpers/disputePacketPdf";
import { buildSimpleDisputePacketContent } from "../../helpers/disputePacketTemplate";

function buildPacket() {
  return buildSimpleDisputePacketContent({
    packetType: "credit_bureau",
    reportType: "Equifax credit report",
    recipient: {
      type: "credit_bureau",
      name: "Equifax Canada",
      address: ["National Consumer Relations", "Montreal, Quebec H1S 2Z2"],
    },
    consumer: {
      name: "Test Consumer",
      address: ["1 Main St", "Halifax, NS B3H 0A1"],
    },
    disputedItems: [
      {
        issueId: 1,
        tradelineId: 2,
        creditorCollectorName: "Sample Bank",
        accountNumber: "555544443333",
        disputedField: "account status",
        reportedValue: "Open",
        expectedValue: "Closed",
        issueType: "ACCOUNT_STATUS_INCONSISTENCY",
        evidenceReference: "Source report #3; field: account status",
      },
    ],
  });
}

describe("simple dispute packet PDF", () => {
  it("generates a downloadable PDF for a credit bureau packet", async () => {
    const base64 = await generateDisputePacketPDF(buildPacket(), "11", "22");
    const bytes = Buffer.from(base64, "base64");

    expect(bytes.subarray(0, 4).toString("utf8")).toBe("%PDF");
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("supports the service-send render path with recipient overrides", async () => {
    const packet = buildPacket();
    applyRecipientOverrideToPacketContent(packet, {
      name: "Sample Collections",
      addressLine1: "10 Agency Rd",
      city: "Toronto",
      province: "ON",
      postalCode: "M5H 1A1",
    });

    const base64 = await generatePacketContentPdfBase64(packet, "11", "23");
    const bytes = Buffer.from(base64, "base64");

    expect(packet.recipient.name).toBe("Sample Collections");
    expect(packet.recipient.address.join(" ")).toContain("10 Agency Rd");
    expect(bytes.subarray(0, 4).toString("utf8")).toBe("%PDF");
  });
});
