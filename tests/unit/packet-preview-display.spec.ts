import { describe, expect, it } from "vitest";

import { buildPacketPreviewDisplayContent } from "../../helpers/packetPreviewDisplay";
import { buildSimpleDisputePacketContent } from "../../helpers/disputePacketTemplate";

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
    const combined = [
      preview.letterText,
      ...preview.evidenceSummary,
      ...preview.attachmentChecklist,
    ].join("\n");

    expect(combined).toContain("Credit report reviewed:");
    expect(combined).toContain("Disputed Account");
    expect(combined).toContain("Company reporting the account: Rogers Communications");
    expect(combined).toContain("Account: Account identifier unavailable");
    expect(combined).toContain("Information disputed: Date last reported");
    expect(combined).toContain("Reported value: Aug 21, 2012");
    expect(combined).toContain("Requested result: Verify the correct information");
    expect(preview.attachmentChecklist.length).toBeGreaterThan(0);
    expect(preview.evidenceSummary.length).toBeGreaterThan(0);
    expect(combined).not.toMatch(/tradeline|artifact|source report|field:|PIPEDA_|2012-08-21T|lastReportedDate|sourceReportArtifactId|Account ending reau|Expected:\s*Not known/i);
    expect(packet.metadata.internalReferences?.[0]).toMatchObject({
      reportArtifactId: 77,
      regulationIds: ["PIPEDA_4_5"],
      fieldKey: "lastReportedDate",
    });
  });
});
