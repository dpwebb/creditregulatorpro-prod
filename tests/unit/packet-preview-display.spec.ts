import { describe, expect, it } from "vitest";

import { buildPacketPreviewDisplayContent } from "../../helpers/packetPreviewDisplay";
import {
  buildConsumerDisputePacketLetterText,
  buildSimpleDisputePacketContent,
} from "../../helpers/disputePacketTemplate";
import { buildDisputePacketPdfLetterText } from "../../helpers/disputePacketPdf";

const forbiddenConsumerPacketOutput =
  /tradeline|artifact|report artifact|source report #|field:|PIPEDA_|BALANCE_CALCULATION_VIOLATION|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z|LasReportedDate|Lastreporteddate|lastReportedDate|sourceReportArtifactId|reportArtifactId|tradelineId|Account ending reau|Expected:\s*Not known|PDF rendering is content-based|render\/cache|render and cache|cache retrieval|cache-miss|internal render|system diagnostic/i;

describe("packet preview display content", () => {
  it("builds recipient-facing preview text from the humanized letter path", () => {
    const packet = buildSimpleDisputePacketContent({
      packetType: "credit_bureau",
      reportType: "TransUnion report artifact #77",
      reportDate: "2012-08-21T00:00:00.000Z",
      dateGenerated: "2026-05-21T00:00:00.000Z",
      recipient: {
        type: "credit_bureau",
        name: "TransUnion Canada",
        address: ["Consumer Relations"],
      },
      consumer: {
        name: "Test Consumer",
        address: ["1 Main St", "Halifax, NS B3H 0A1"],
      },
      disputedItems: [
        {
          issueId: 42,
          tradelineId: 222,
          creditorCollectorName: "Rogers Communications",
          accountNumber: "reau",
          disputedField: "lastReportedDate",
          reportedValue: "2012-08-21T00:00:00.000Z",
          expectedValue: "Not known",
          issueType: "BALANCE_CALCULATION_VIOLATION",
          explanation: "PIPEDA_4_5 source report #77 field: lastReportedDate tradelineId: 222",
          evidenceReference: "reportArtifactId: 77; tradelineId: 222; field: lastReportedDate; page 4",
        },
      ],
      reportArtifactIds: [77],
      generatedByUserId: 20,
    });
    packet.metadata.internalReferences = [
      {
        findingId: 42,
        violationId: 9001,
        tradelineId: 222,
        reportArtifactId: 77,
        evidenceIds: ["evidence-raw-77"],
        regulationIds: ["PIPEDA_4_5"],
        ruleIds: ["BALANCE_CALCULATION_VIOLATION"],
        fieldKey: "lastReportedDate",
        sourceField: "sourceReportArtifactId",
        readiness: { packetReady: true },
      },
    ];
    packet.attachmentChecklist.push("Source report #77; field: lastReportedDate; artifact ID 77");

    const preview = buildPacketPreviewDisplayContent(packet);
    const templateLetterText = buildConsumerDisputePacketLetterText(packet);
    const pdfLetterText = buildDisputePacketPdfLetterText(packet);
    const combined = [
      preview.letterText,
      ...preview.evidenceSummary,
      ...preview.attachmentChecklist,
    ].join("\n");

    expect(preview.letterText).toBe(templateLetterText);
    expect(combined).toContain("Subject: Dispute of Credit Report Information");
    expect(combined).toContain("credit report dated Aug 21, 2012");
    expect(combined).toContain("Creditor/Reporter: Rogers Communications");
    expect(combined).toContain("Account Number: Account number not shown on report");
    expect(combined).toContain("Date Reported / Last Activity: Date last reported: Aug 21, 2012");
    expect(combined).toContain("The balance being reported does not appear accurate based on my records.");
    expect(pdfLetterText).toContain("Subject: Dispute of Credit Report Information");
    expect(pdfLetterText).toContain("Creditor/Reporter: Rogers Communications");
    expect(pdfLetterText).toContain("Account Number: Account number not shown on report");
    expect(pdfLetterText).toContain("Date Reported / Last Activity: Date last reported: Aug 21, 2012");
    expect(pdfLetterText).toContain("The balance being reported does not appear accurate based on my records.");
    expect(pdfLetterText).not.toContain("Requested action:");
    expect(preview.attachmentChecklist.length).toBeGreaterThan(0);
    expect(preview.evidenceSummary.length).toBeGreaterThan(0);
    expect(combined).not.toMatch(forbiddenConsumerPacketOutput);
    expect(pdfLetterText).not.toMatch(forbiddenConsumerPacketOutput);
    expect(packet.metadata.internalReferences?.[0]).toMatchObject({
      reportArtifactId: 77,
      regulationIds: ["PIPEDA_4_5"],
      fieldKey: "lastReportedDate",
    });
  });
});
