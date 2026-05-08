import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logAudit: vi.fn(),
}));

vi.mock("../../helpers/auditLogger", () => ({
  logAudit: mocks.logAudit,
}));

import { SCANNED_PDF_UNSUPPORTED_CODE } from "../../helpers/creditReportPdfEligibility";
import { logRejectedScannedPdfUpload } from "../../helpers/creditReportUploadRejectionAudit";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.logAudit.mockResolvedValue({ success: true });
});

describe("credit report upload rejection audit", () => {
  it("logs scanned-PDF rejection metadata without file contents or raw text", async () => {
    const bytesBase64 = Buffer.from("%PDF-1.4\n%%EOF", "utf8").toString("base64");
    const request = new Request("https://staging.creditregulatorpro.com/_api/ingest/report", {
      headers: {
        "x-forwarded-for": "203.0.113.42, 198.51.100.10",
        "user-agent": "vitest",
      },
    });

    await logRejectedScannedPdfUpload({
      route: "authenticated_ingest",
      userId: 123,
      bytesBase64,
      mimeType: "application/pdf",
      request,
      quality: {
        isValid: false,
        printableRatio: 0,
        keywordCount: 0,
        avgWordLength: 0,
        totalChars: 2,
        invalidReason: "Text too short (< 100 characters)",
      },
    });

    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
    const payload = mocks.logAudit.mock.calls[0][0];

    expect(payload).toMatchObject({
      action: "UPLOAD",
      entityType: "REPORT_ARTIFACT",
      entityId: null,
      userId: 123,
      status: "FAILURE",
      request,
      details: {
        route: "authenticated_ingest",
        reasonCode: SCANNED_PDF_UNSUPPORTED_CODE,
        mimeType: "application/pdf",
        fileSizeBytes: Buffer.from(bytesBase64, "base64").length,
        persistedArtifact: false,
        textQuality: {
          isValid: false,
          totalChars: 2,
          invalidReason: "Text too short (< 100 characters)",
        },
      },
    });
    expect(payload.details.sha256).toMatch(/^[a-f0-9]{64}$/);

    const serialized = JSON.stringify(payload.details);
    expect(serialized).not.toContain(bytesBase64);
    expect(serialized).not.toContain("%PDF-1.4");
    expect(serialized).not.toContain("fileName");
    expect(serialized).not.toContain("rawText");
  });
});
