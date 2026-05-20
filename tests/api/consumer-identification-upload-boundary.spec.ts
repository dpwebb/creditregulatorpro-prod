import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotAuthenticatedError } from "../../helpers/getSetServerSession";
import {
  CONSUMER_IDENTIFICATION_UPLOAD_MAX_BYTES,
  getUploadRequestBodyMaxBytes,
} from "../../helpers/uploadPayloadValidation";

const mocks = vi.hoisted(() => ({
  getServerUserSession: vi.fn(),
  saveConsumerIdentificationDocument: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("../../helpers/getServerUserSession", () => ({
  getServerUserSession: mocks.getServerUserSession,
}));

vi.mock("../../helpers/consumerIdentification", () => ({
  saveConsumerIdentificationDocument: mocks.saveConsumerIdentificationDocument,
}));

vi.mock("../../helpers/auditLogger", () => ({
  logAudit: mocks.logAudit,
}));

import { handle as uploadConsumerIdentification } from "../../endpoints/user/identification_POST";

const pngBase64 = Buffer.from("synthetic-png-identification", "utf8").toString("base64");

function currentUser() {
  return {
    id: 42,
    role: "user",
    organizationId: null,
    displayName: "Synthetic User",
    email: "synthetic-id@example.invalid",
  };
}

function postRequest(pathname: string, body: unknown): Request {
  return new Request(`http://localhost${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function oversizedRawPostRequest(pathname: string, maxDecodedBytes: number): Request {
  return new Request(`http://localhost${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(getUploadRequestBodyMaxBytes(maxDecodedBytes) + 1),
    },
    body: "{",
  });
}

function oversizedBase64For(limitBytes: number): string {
  return "A".repeat(Math.ceil((limitBytes + 1) / 3) * 4);
}

function identificationBody(overrides: Record<string, unknown> = {}) {
  return {
    fileName: "synthetic-id.png",
    fileType: "image/png",
    fileDataBase64: `data:image/png;base64,${pngBase64}`,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getServerUserSession.mockResolvedValue({ user: currentUser() });
  mocks.saveConsumerIdentificationDocument.mockResolvedValue({
    id: 8801,
    fileName: "synthetic-id.png",
    fileType: "image/png",
    fileSizeBytes: 28,
    uploadedAt: "2026-05-20T00:00:00.000Z",
    updatedAt: "2026-05-20T00:00:00.000Z",
    fileUrl: "/_api/user/identification/file",
  });
  mocks.logAudit.mockResolvedValue({ success: true });
});

describe("consumer identification upload boundaries", () => {
  it("rejects unauthenticated uploads before reading or validating the request body", async () => {
    mocks.getServerUserSession.mockRejectedValueOnce(new NotAuthenticatedError());
    const request = postRequest("/_api/user/identification", "{");
    const textSpy = vi.spyOn(request, "text");

    const response = await uploadConsumerIdentification(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Not authenticated" });
    expect(textSpy).not.toHaveBeenCalled();
    expect(mocks.saveConsumerIdentificationDocument).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("rejects oversized consumer identification before storage or audit work", async () => {
    const rawOversized = await uploadConsumerIdentification(
      oversizedRawPostRequest("/_api/user/identification", CONSUMER_IDENTIFICATION_UPLOAD_MAX_BYTES),
    );

    expect(rawOversized.status).toBe(413);
    await expect(rawOversized.json()).resolves.toEqual({
      error: "Identification image request body exceeds the 8 MB upload limit",
    });
    expect(mocks.saveConsumerIdentificationDocument).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();

    const oversizedPayload = await uploadConsumerIdentification(postRequest("/_api/user/identification", identificationBody({
      fileDataBase64: oversizedBase64For(CONSUMER_IDENTIFICATION_UPLOAD_MAX_BYTES),
    })));

    expect(oversizedPayload.status).toBe(400);
    await expect(oversizedPayload.json()).resolves.toEqual({
      error: "Identification image exceeds the 8 MB upload limit",
    });
    expect(mocks.saveConsumerIdentificationDocument).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("rejects malformed base64 and invalid MIME before storage or audit work", async () => {
    const malformed = await uploadConsumerIdentification(postRequest("/_api/user/identification", identificationBody({
      fileDataBase64: "data:image/png;base64,not-valid-base64!",
    })));

    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({
      error: "Identification image data must be valid base64",
    });
    expect(mocks.saveConsumerIdentificationDocument).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();

    const invalidMime = await uploadConsumerIdentification(postRequest("/_api/user/identification", identificationBody({
      fileName: "synthetic-id.pdf",
      fileType: "application/pdf",
      fileDataBase64: `data:application/pdf;base64,${Buffer.from("%PDF-synthetic", "utf8").toString("base64")}`,
    })));

    expect(invalidMime.status).toBe(400);
    await expect(invalidMime.json()).resolves.toEqual({
      error: "Upload a PNG or JPEG image of your identification",
    });
    expect(mocks.saveConsumerIdentificationDocument).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("preserves the valid consumer identification upload path", async () => {
    const response = await uploadConsumerIdentification(
      postRequest("/_api/user/identification", identificationBody()),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      identification: {
        id: 8801,
        fileName: "synthetic-id.png",
        fileType: "image/png",
        fileUrl: "/_api/user/identification/file",
      },
    });
    expect(mocks.saveConsumerIdentificationDocument).toHaveBeenCalledWith({
      userId: 42,
      fileName: "synthetic-id.png",
      fileType: "image/png",
      fileDataBase64: `data:image/png;base64,${pngBase64}`,
    });
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "UPLOAD",
      entityType: "USER_ACCOUNT",
      entityId: 42,
      userId: 42,
      status: "SUCCESS",
    }));
  });
});
