import { beforeEach, describe, expect, it, vi } from "vitest";

const executeTakeFirstMock = vi.hoisted(() => vi.fn());

vi.mock("./db", () => {
  const makeBuilder = () => {
    const builder = {
      select: vi.fn(() => builder),
      where: vi.fn(() => builder),
      executeTakeFirst: executeTakeFirstMock,
    };
    return builder;
  };

  return {
    db: {
      selectFrom: vi.fn(() => makeBuilder()),
    },
  };
});

import { createPassAGatingResponse, isPassACompleted, requirePassA } from "./passAGating";

describe("passAGating", () => {
  beforeEach(() => {
    executeTakeFirstMock.mockReset();
  });

  it("returns success:true when Pass-A exists and is completed", async () => {
    executeTakeFirstMock.mockResolvedValue({
      bureauContext: {
        bureau_name: {
          value: "TransUnion",
          confidence: 0.9,
          evidence: { page_number: 1, source_method: "pdf_text", snippet: "TransUnion" },
        },
      },
      consumerProfile: { address_history: [], phone_history: [], employment_history: [] },
      rawEvidence: [],
      conflicts: [],
      missingRequiredFields: [],
      qualityNotes: [],
      completedAt: new Date("2024-01-15T10:00:00Z"),
      channelGuess: "TransUnion Credit Monitoring",
    });

    const result = await requirePassA(123);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.extraction.doc_id).toBe(123);
      expect(result.extraction.pass).toBe("A");
      expect(result.extraction.schema).toBe("urn:compnd:schemas:pass-a-draft-extraction:v1");
      expect(result.extraction.extracted_at).toBe("2024-01-15T10:00:00.000Z");
    }
  });

  it("returns success:false with a 409 gating error when Pass-A is missing", async () => {
    executeTakeFirstMock.mockResolvedValue(undefined);

    const result = await requirePassA(456);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toEqual({
        status: 409,
        message: "Full draft extraction required before further parsing",
        hint: "Call POST /ingest/report to run full extraction first",
        artifactId: 456,
      });
    }
  });

  it("returns true only when isPassACompleted finds a completed extraction", async () => {
    executeTakeFirstMock.mockResolvedValueOnce({ id: 1 });
    await expect(isPassACompleted(123)).resolves.toBe(true);

    executeTakeFirstMock.mockResolvedValueOnce(undefined);
    await expect(isPassACompleted(456)).resolves.toBe(false);
  });

  it("creates an HTTP 409 response with the standardized body", async () => {
    const response = createPassAGatingResponse(999);

    expect(response.status).toBe(409);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    await expect(response.json()).resolves.toEqual({
      error: "Full draft extraction required before further parsing",
      hint: "Call POST /ingest/report to run full extraction first",
      artifactId: 999,
    });
  });
});
