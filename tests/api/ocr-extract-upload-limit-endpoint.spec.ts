import { beforeEach, describe, expect, it, vi } from "vitest";

import { getUploadRequestBodyMaxBytes } from "../../helpers/uploadPayloadValidation";

const mocks = vi.hoisted(() => ({
  getServerUserSession: vi.fn(),
  checkRateLimit: vi.fn(),
  extractCanonicalCreditReport: vi.fn(),
  normalizeTradelines: vi.fn(),
  scoreTradelines: vi.fn(),
}));

vi.mock("../../helpers/getServerUserSession", () => ({
  getServerUserSession: mocks.getServerUserSession,
}));

vi.mock("../../helpers/rateLimiter", () => ({
  checkRateLimit: mocks.checkRateLimit,
  RateLimitConfig: {
    REPORT_PARSE: { maxAttempts: 10, windowMinutes: 60 },
  },
}));

vi.mock("../../helpers/canonicalCreditReportExtractor", () => ({
  extractCanonicalCreditReport: mocks.extractCanonicalCreditReport,
}));

vi.mock("../../helpers/normalization", () => ({
  normalizeTradelines: mocks.normalizeTradelines,
}));

vi.mock("../../helpers/confidenceScorer", () => ({
  scoreTradelines: mocks.scoreTradelines,
}));

import { handle as extractOcr } from "../../endpoints/ocr/extract_POST";

const OCR_PDF_MAX_BYTES = 15 * 1024 * 1024;

function oversizedBase64For(limitBytes: number) {
  return "A".repeat(Math.ceil((limitBytes + 1) / 3) * 4);
}

function postRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/_api/ocr/extract", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "synthetic-ocr-upload-limit-test" },
    body: JSON.stringify({
      userId: "11111111-1111-4111-8111-111111111111",
      region: "CA",
      fileName: "synthetic-credit-report.pdf",
      mimeType: "application/pdf",
      bytesBase64: Buffer.from("%PDF-1.4\n%%EOF", "utf8").toString("base64"),
      ...body,
    }),
  });
}

function oversizedRawPostRequest() {
  return new Request("http://localhost/_api/ocr/extract", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(getUploadRequestBodyMaxBytes(OCR_PDF_MAX_BYTES) + 1),
      "user-agent": "synthetic-ocr-upload-limit-test",
    },
    body: "{",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.getServerUserSession.mockResolvedValue({
    user: { id: 10, role: "user", organizationId: null },
  });
  mocks.checkRateLimit.mockResolvedValue({ allowed: true });
  mocks.extractCanonicalCreditReport.mockResolvedValue({
    parseResult: { tradelines: [{ creditorName: "Synthetic Creditor" }] },
  });
  mocks.normalizeTradelines.mockReturnValue([{ creditorName: "Synthetic Creditor" }]);
  mocks.scoreTradelines.mockReturnValue([{ creditorName: "Synthetic Creditor", confidence: 1 }]);
});

describe("OCR extract upload limit contract", () => {
  it("keeps the existing 15 MB PDF extraction limit before OCR parsing work", async () => {
    const response = await extractOcr(
      postRequest({ bytesBase64: oversizedBase64For(OCR_PDF_MAX_BYTES) }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "PDF file exceeds the 15 MB upload limit",
    });
    expect(mocks.extractCanonicalCreditReport).not.toHaveBeenCalled();
    expect(mocks.normalizeTradelines).not.toHaveBeenCalled();
    expect(mocks.scoreTradelines).not.toHaveBeenCalled();
  });

  it("rejects raw oversized OCR request bodies before JSON parse or OCR parsing work", async () => {
    const response = await extractOcr(oversizedRawPostRequest());

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "PDF file request body exceeds the 15 MB upload limit",
    });
    expect(mocks.extractCanonicalCreditReport).not.toHaveBeenCalled();
    expect(mocks.normalizeTradelines).not.toHaveBeenCalled();
    expect(mocks.scoreTradelines).not.toHaveBeenCalled();
  });

  it("rejects malformed OCR base64 before OCR parsing work", async () => {
    const response = await extractOcr(postRequest({ bytesBase64: "not-valid-base64!" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "PDF file data must be valid base64",
    });
    expect(mocks.extractCanonicalCreditReport).not.toHaveBeenCalled();
    expect(mocks.normalizeTradelines).not.toHaveBeenCalled();
    expect(mocks.scoreTradelines).not.toHaveBeenCalled();
  });

  it("rejects unsupported OCR MIME types before OCR parsing work", async () => {
    const response = await extractOcr(
      postRequest({
        fileName: "synthetic-credit-report.png",
        mimeType: "image/png",
        bytesBase64: Buffer.from("SYNTHETIC_IMAGE_BYTES", "utf8").toString("base64"),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Only PDF extraction is supported",
    });
    expect(mocks.extractCanonicalCreditReport).not.toHaveBeenCalled();
    expect(mocks.normalizeTradelines).not.toHaveBeenCalled();
    expect(mocks.scoreTradelines).not.toHaveBeenCalled();
  });

  it("preserves the existing valid PDF OCR extraction path", async () => {
    const response = await extractOcr(postRequest({}));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      extractedData: [{ creditorName: "Synthetic Creditor", confidence: 1 }],
      tradelinesCount: 1,
    });
    expect(body.reviewSessionId).toEqual(expect.any(String));
    expect(mocks.extractCanonicalCreditReport).toHaveBeenCalledWith({
      bytesBase64: Buffer.from("%PDF-1.4\n%%EOF", "utf8").toString("base64"),
      mimeType: "application/pdf",
      allowAiFallback: false,
    });
  });
});
