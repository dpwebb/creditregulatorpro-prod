import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  events: [] as Record<string, unknown>[],
  storage: new Map<string, Buffer>(),
  db: {
    selectFrom: vi.fn(),
    insertInto: vi.fn(),
  },
  readStoredPdf: vi.fn(),
  uploadPdf: vi.fn(),
}));

vi.mock("../../helpers/db", () => ({
  db: mocks.db,
}));

vi.mock("../../helpers/documentStorage", () => ({
  readStoredPdf: mocks.readStoredPdf,
  uploadPdf: mocks.uploadPdf,
}));

import {
  getOrRenderPacketPdfBase64,
  PACKET_PDF_CACHE_HIT_EVENT,
  PACKET_PDF_RENDER_ATTEMPT_EVENT,
  PACKET_PDF_RENDER_FAILED_EVENT,
  PACKET_PDF_RENDER_SUCCEEDED_EVENT,
} from "../../helpers/packetPdfCache";
import { buildSimpleDisputePacketContent } from "../../helpers/disputePacketTemplate";

function installDbHarness() {
  mocks.db.selectFrom.mockImplementation(() => {
    const builder: Record<string, any> = {};
    builder.select = vi.fn(() => builder);
    builder.where = vi.fn(() => builder);
    builder.orderBy = vi.fn(() => builder);
    builder.limit = vi.fn(() => builder);
    builder.executeTakeFirst = vi.fn(async () => {
      const latest = mocks.events[mocks.events.length - 1];
      return latest?.currentHash ? { currentHash: latest.currentHash } : null;
    });
    return builder;
  });

  mocks.db.insertInto.mockImplementation(() => {
    const builder: Record<string, any> = {};
    let value: Record<string, unknown> | null = null;
    builder.values = vi.fn((input: Record<string, unknown>) => {
      value = input;
      return builder;
    });
    builder.execute = vi.fn(async () => {
      if (value) mocks.events.push(value);
      return [];
    });
    return builder;
  });
}

function missingObjectError(): NodeJS.ErrnoException {
  const error = new Error("Object not found") as NodeJS.ErrnoException;
  error.code = "ENOENT";
  return error;
}

function packetContent(note = "Synthetic compact evidence reference.") {
  return buildSimpleDisputePacketContent({
    packetType: "credit_bureau",
    reportType: "Synthetic",
    recipient: {
      type: "credit_bureau",
      name: "Synthetic Bureau",
      address: ["100 Bureau Road", "Toronto, ON M5A 0A1"],
    },
    consumer: {
      name: "Synthetic Consumer",
      address: ["200 Home Road", "Halifax, NS B3J 0A1"],
    },
    disputedItems: [
      {
        issueId: 301,
        tradelineId: 701,
        creditorCollectorName: "Synthetic Creditor",
        accountNumber: "1234567890",
        disputedField: "Balance",
        reportedValue: "$200",
        expectedValue: "$100",
        issueType: "BALANCE_CALCULATION_VIOLATION",
        evidenceReference: note,
      },
    ],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.events.length = 0;
  mocks.storage.clear();
  installDbHarness();
  mocks.readStoredPdf.mockImplementation(async (storageUrl: string) => {
    const bytes = mocks.storage.get(storageUrl);
    if (!bytes) throw missingObjectError();
    return bytes;
  });
  mocks.uploadPdf.mockImplementation(async (base64Pdf: string, objectName: string) => {
    const storageUrl = `local:${objectName}`;
    mocks.storage.set(storageUrl, Buffer.from(base64Pdf, "base64"));
    return storageUrl;
  });
});

describe("packet PDF cache", () => {
  it("renders and stores the first cache miss with durable render events", async () => {
    const base64Pdf = Buffer.from("%PDF-synthetic").toString("base64");
    const renderBase64 = vi.fn(async () => base64Pdf);

    const result = await getOrRenderPacketPdfBase64({
      packetId: 601,
      userId: 10,
      purpose: "download",
      packetContent: packetContent(),
      renderBase64,
    });

    expect(result.cacheHit).toBe(false);
    expect(result.base64Pdf).toBe(base64Pdf);
    expect(result.storageUrl).toMatch(/^local:packet-pdfs\/10\/601\/download-[a-f0-9]{64}\.pdf$/);
    expect(result.cacheAccessDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.renderDurationMs).toEqual(expect.any(Number));
    expect(renderBase64).toHaveBeenCalledTimes(1);
    expect(mocks.uploadPdf).toHaveBeenCalledWith(base64Pdf, result.objectName);
    expect(mocks.events.map((event) => event.eventType)).toEqual([
      PACKET_PDF_RENDER_ATTEMPT_EVENT,
      PACKET_PDF_RENDER_SUCCEEDED_EVENT,
    ]);
  });

  it("reuses an existing cache entry without calling the generator again", async () => {
    const base64Pdf = Buffer.from("%PDF-cached").toString("base64");
    await getOrRenderPacketPdfBase64({
      packetId: 601,
      userId: 10,
      purpose: "download",
      packetContent: packetContent(),
      renderBase64: vi.fn(async () => base64Pdf),
    });

    const renderBase64 = vi.fn(async () => {
      throw new Error("Generator should not be called");
    });
    const result = await getOrRenderPacketPdfBase64({
      packetId: 601,
      userId: 10,
      purpose: "download",
      packetContent: packetContent(),
      renderBase64,
    });

    expect(result.cacheHit).toBe(true);
    expect(result.base64Pdf).toBe(base64Pdf);
    expect(result.cacheAccessDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.renderDurationMs).toBeNull();
    expect(renderBase64).not.toHaveBeenCalled();
    expect(mocks.uploadPdf).toHaveBeenCalledTimes(1);
    expect(mocks.events.map((event) => event.eventType)).toEqual([
      PACKET_PDF_RENDER_ATTEMPT_EVENT,
      PACKET_PDF_RENDER_SUCCEEDED_EVENT,
      PACKET_PDF_CACHE_HIT_EVENT,
    ]);
  });

  it("invalidates by content-derived cache key when packet content changes", async () => {
    const firstRender = vi.fn(async () => Buffer.from("%PDF-first").toString("base64"));
    const secondRender = vi.fn(async () => Buffer.from("%PDF-second").toString("base64"));

    const first = await getOrRenderPacketPdfBase64({
      packetId: 601,
      userId: 10,
      purpose: "mail",
      packetContent: packetContent("Original evidence reference."),
      renderBase64: firstRender,
    });
    const second = await getOrRenderPacketPdfBase64({
      packetId: 601,
      userId: 10,
      purpose: "mail",
      packetContent: packetContent("Updated evidence reference."),
      renderBase64: secondRender,
    });

    expect(first.cacheKey).not.toBe(second.cacheKey);
    expect(firstRender).toHaveBeenCalledTimes(1);
    expect(secondRender).toHaveBeenCalledTimes(1);
    expect(mocks.uploadPdf).toHaveBeenCalledTimes(2);
  });

  it("records a render failure event without storing raw packet content", async () => {
    const sensitiveContent = packetContent("SYNTHETIC_RAW_PACKET_BODY_SHOULD_NOT_APPEAR");
    const renderBase64 = vi.fn(async () => {
      throw new Error("SYNTHETIC_RAW_TEXT_SHOULD_NOT_APPEAR");
    });

    await expect(
      getOrRenderPacketPdfBase64({
        packetId: 601,
        userId: 10,
        purpose: "download",
        packetContent: sensitiveContent,
        renderBase64,
      }),
    ).rejects.toThrow("SYNTHETIC_RAW_TEXT_SHOULD_NOT_APPEAR");

    expect(mocks.uploadPdf).not.toHaveBeenCalled();
    expect(mocks.events.map((event) => event.eventType)).toEqual([
      PACKET_PDF_RENDER_ATTEMPT_EVENT,
      PACKET_PDF_RENDER_FAILED_EVENT,
    ]);
    const persistedEventText = JSON.stringify(mocks.events);
    expect(persistedEventText).not.toContain("SYNTHETIC_RAW_PACKET_BODY_SHOULD_NOT_APPEAR");
    expect(persistedEventText).not.toContain("SYNTHETIC_RAW_TEXT_SHOULD_NOT_APPEAR");
    expect(persistedEventText).not.toMatch(/data:application\/pdf;base64/i);
  });
});
