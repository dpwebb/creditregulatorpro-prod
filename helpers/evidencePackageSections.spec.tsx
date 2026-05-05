import {
  generateEvidenceAttachmentsIndex,
  generateExecutiveSummary,
  generateStatutoryReferences,
} from "./evidencePackageSections";
import type { EvidencePackageData } from "./evidencePackageData";

const buildEvidencePackageData = (): EvidencePackageData =>
  ({
    obligation: {
      id: 42,
      accountNumber: "ACCT-42",
      creditorName: "Test Creditor",
      bureauName: "Test Bureau",
      state: "OPEN",
      disputeVector: null,
    },
    packets: [],
    auditLogs: [],
    attachments: [],
    evidenceEvents: [],
    statutes: [],
    escalationCount: 0,
    daysSinceChallenge: 0,
    creditorMetrics: [],
  }) as EvidencePackageData;

describe("evidencePackageSections null/invalid fallbacks", () => {
  it("renders N/A for invalid packet dates in executive summary", () => {
    const data = buildEvidencePackageData();
    data.packets = [
      {
        id: 1,
        createdAt: "not-a-real-date",
        type: null,
        status: null,
        bureauResponseDate: "also-not-a-date",
      } as any,
    ];

    const content = generateExecutiveSummary(data);
    const timelineTable = (content[3] as any).table;
    const firstDataRow = timelineTable.body[1];

    expect(firstDataRow[0]).toBe("N/A");
    expect(firstDataRow[3]).toBe("N/A");
  });

  it("renders N/A for invalid attachment date and a description fallback", () => {
    const data = buildEvidencePackageData();
    data.attachments = [
      {
        fileName: "proof.png",
        uploadedAt: "bad-upload-date",
        fileSizeBytes: 2048,
        description: null,
        storageUrl: null,
      } as any,
    ];

    const content = generateEvidenceAttachmentsIndex(data);
    const attachmentsTable = (content[2] as any).table;
    const firstDataRow = attachmentsTable.body[1];

    expect(firstDataRow[1]).toBe("N/A");
    expect(firstDataRow[3]).toBe("No description");
  });

  it("renders N/A for invalid statute effective dates", () => {
    const data = buildEvidencePackageData();
    data.statutes = [
      {
        code: "FCRA-1681",
        jurisdiction: "US",
        sectionReference: null,
        description: null,
        effectiveDate: "definitely-invalid",
        responseClockDays: null,
        sourceUrl: null,
      } as any,
    ];

    const content = generateStatutoryReferences(data);
    const effectiveDateLine = content.find(
      (item) => typeof item === "object" && item !== null && "text" in item && item.text === "Effective Date: N/A"
    );

    expect(effectiveDateLine).toBeDefined();
  });
});
