// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pdfParse from "pdf-parse";

import {
  applyRecipientOverrideToPacketContent,
  generatePacketContentPdfBase64,
} from "../../helpers/packetPdfContent";
import { generateDisputePacketPDF } from "../../helpers/disputePacketPdf";
import { buildSimpleDisputePacketContent } from "../../helpers/disputePacketTemplate";

const originalFetch = globalThis.fetch;
const validIdentificationImage =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWMAgv8AAQQBAP8H9UQAAAAASUVORK5CYII=";

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

async function extractPdfText(base64: string): Promise<string> {
  const data = await pdfParse(Buffer.from(base64, "base64") as any);
  return data.text.replace(/\s+/g, " ").trim();
}

describe("simple dispute packet PDF", () => {
  beforeEach(() => {
    delete process.env.CRP_PDF_REMOTE_FONT_FETCH;
    globalThis.fetch = vi.fn(async () => {
      throw new Error("Remote font fetch must not run for packet PDF rendering");
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.CRP_PDF_REMOTE_FONT_FETCH;
  });

  it("generates a downloadable PDF for a credit bureau packet", async () => {
    const packet = buildPacket();
    packet.consumerIdentificationImage = validIdentificationImage;
    packet.consumerIdentificationFileName = "synthetic-id.png";
    const base64 = await generateDisputePacketPDF(packet, "11", "22");
    const bytes = Buffer.from(base64, "base64");

    expect(bytes.subarray(0, 4).toString("utf8")).toBe("%PDF");
    expect(bytes.length).toBeGreaterThan(1000);
    expect(globalThis.fetch).not.toHaveBeenCalled();
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

  it("renders readable account blocks without internal packet terms", async () => {
    const packet = buildSimpleDisputePacketContent({
      packetType: "credit_bureau",
      reportType: "TransUnion report artifact #77",
      reportDate: "2012-08-21T00:00:00.000Z",
      dateGenerated: "2026-05-21T00:00:00.000Z",
      recipient: {
        type: "credit_bureau",
        name: "TransUnion Canada",
        address: ["Consumer Relations", "3115 Harvester Road"],
      },
      consumer: {
        name: "Test Consumer",
        address: ["1 Main St", "Halifax, NS B3H 0A1"],
      },
      disputedItems: [
        {
          issueId: 111,
          tradelineId: 222,
          creditorCollectorName: "Sample Bank",
          accountNumber: "555544443333",
          disputedField: "lastReportedDate",
          reportedValue: "2012-08-21T00:00:00.000Z",
          expectedValue: "Not known",
          issueType: "BALANCE_CALCULATION_VIOLATION",
          explanation: "PIPEDA_4_5 source report #77 field: lastReportedDate tradelineId: 222",
          evidenceReference: "source report #77; field: lastReportedDate; reportArtifactId: 77; tradelineId: 222",
        },
        {
          issueId: 112,
          tradelineId: 223,
          creditorCollectorName: "Sample Collector",
          accountNumber: "reau",
          disputedField: "currentBalance",
          reportedValue: "$400",
          expectedValue: null,
          issueType: "BALANCE_CALCULATION_VIOLATION",
          explanation: "Review the balance shown on source report #77.",
          evidenceReference: "source report #77; field: currentBalance",
        },
      ],
      reportArtifactIds: [77],
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
        sourceField: "sourceReportArtifactId",
        readiness: { packetReady: true, findingEligible: true },
      },
    ];
    packet.attachmentChecklist.push(
      "Source report #77; field: currentBalance; sourceReportArtifactId: 77; referenceId: PIPEDA_4_5",
    );

    const text = await extractPdfText(await generateDisputePacketPDF(packet));

    expect(text).toContain("Disputed Account");
    expect(text).toContain("Company reporting the account");
    expect(text).toContain("Account: Account ending 3333");
    expect(text).toContain("Account: Account number not provided on report");
    expect(text).toContain("Information I am disputing: Date last reported");
    expect(text).toContain("What the report shows: Aug 21, 2012");
    expect(text).toContain("What I am requesting: Please verify this information and correct or remove it if it cannot be supported.");
    expect(text).not.toMatch(/Creditor\/collector|Requested action\s+Account\s+Field\s+Reported\s+Expected/i);
    expect(text).not.toMatch(/tradeline|artifact|field:|source report|PIPEDA_4_5|BALANCE_CALCULATION_VIOLATION/i);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(text).not.toMatch(/lastReportedDate|currentBalance|sourceReportArtifactId|reportArtifactId|tradelineId|referenceId|Account ending reau|Expected:\s*Not known/i);
    expect(packet.metadata.reportArtifactIds).toEqual([77]);
    expect(packet.metadata.internalReferences?.[0]).toMatchObject({
      reportArtifactId: 77,
      tradelineId: 222,
      regulationIds: ["PIPEDA_4_5"],
      fieldKey: "lastReportedDate",
      sourceField: "sourceReportArtifactId",
    });
    expect(packet.disputedItems.map((item) => item.tradelineId)).toEqual([222, 223]);
  });
});
