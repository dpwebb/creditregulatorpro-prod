import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  getPacketPdfCacheMissEnvelopeMetrics,
  PACKET_PDF_CACHE_HIT_EVENT,
  PacketPdfCacheMissOverloadedError,
  PacketPdfCacheMissTimeoutError,
  PACKET_PDF_RENDER_ATTEMPT_EVENT,
  PACKET_PDF_RENDER_FAILED_EVENT,
  PACKET_PDF_RENDER_SUCCEEDED_EVENT,
  resetPacketPdfCacheMissEnvelopeForTests,
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

function clearEnvelopeEnv() {
  delete process.env.CRP_PACKET_PDF_CACHE_MISS_MAX_CONCURRENCY;
  delete process.env.CRP_PACKET_PDF_CACHE_MISS_TIMEOUT_MS;
  delete process.env.CRP_PACKET_PDF_CACHE_MISS_PENDING_LIMIT;
  delete process.env.PACKET_PDF_CACHE_MISS_MAX_CONCURRENCY;
  delete process.env.PACKET_PDF_CACHE_MISS_TIMEOUT_MS;
  delete process.env.PACKET_PDF_CACHE_MISS_PENDING_LIMIT;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeEach(() => {
  vi.clearAllMocks();
  clearEnvelopeEnv();
  resetPacketPdfCacheMissEnvelopeForTests();
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

afterEach(() => {
  clearEnvelopeEnv();
  resetPacketPdfCacheMissEnvelopeForTests();
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

  it("collapses duplicate concurrent cache misses for the same packet content", async () => {
    process.env.CRP_PACKET_PDF_CACHE_MISS_MAX_CONCURRENCY = "2";
    process.env.CRP_PACKET_PDF_CACHE_MISS_PENDING_LIMIT = "4";
    process.env.CRP_PACKET_PDF_CACHE_MISS_TIMEOUT_MS = "1000";
    const base64Pdf = Buffer.from("%PDF-collapsed").toString("base64");
    const render = deferred<string>();
    const renderBase64 = vi.fn(() => render.promise);

    const first = getOrRenderPacketPdfBase64({
      packetId: 602,
      userId: 10,
      purpose: "download",
      packetContent: packetContent("Collapsed duplicate proof."),
      renderBase64,
    });
    const second = getOrRenderPacketPdfBase64({
      packetId: 602,
      userId: 10,
      purpose: "download",
      packetContent: packetContent("Collapsed duplicate proof."),
      renderBase64,
    });

    await vi.waitFor(() => expect(renderBase64).toHaveBeenCalledTimes(1));
    render.resolve(base64Pdf);
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult.base64Pdf).toBe(base64Pdf);
    expect(secondResult.base64Pdf).toBe(base64Pdf);
    expect(firstResult.cacheKey).toBe(secondResult.cacheKey);
    expect(mocks.uploadPdf).toHaveBeenCalledTimes(1);
    expect(mocks.events.map((event) => event.eventType)).toEqual([
      PACKET_PDF_RENDER_ATTEMPT_EVENT,
      PACKET_PDF_RENDER_SUCCEEDED_EVENT,
    ]);
    expect(getPacketPdfCacheMissEnvelopeMetrics().collapsedCount).toBe(1);
  });

  it("bounds distinct cache-miss renders by configured synchronous envelope concurrency", async () => {
    process.env.CRP_PACKET_PDF_CACHE_MISS_MAX_CONCURRENCY = "1";
    process.env.CRP_PACKET_PDF_CACHE_MISS_PENDING_LIMIT = "4";
    process.env.CRP_PACKET_PDF_CACHE_MISS_TIMEOUT_MS = "1000";
    let activeRenders = 0;
    let maxActiveRenders = 0;

    await Promise.all(
      [603, 604, 605].map((packetId) =>
        getOrRenderPacketPdfBase64({
          packetId,
          userId: 10,
          purpose: "mail",
          packetContent: packetContent(`Bounded concurrency packet ${packetId}.`),
          renderBase64: vi.fn(async () => {
            activeRenders += 1;
            maxActiveRenders = Math.max(maxActiveRenders, activeRenders);
            await delay(5);
            activeRenders -= 1;
            return Buffer.from(`%PDF-bounded-${packetId}`).toString("base64");
          }),
        }),
      ),
    );

    const metrics = getPacketPdfCacheMissEnvelopeMetrics();
    expect(maxActiveRenders).toBe(1);
    expect(metrics.maxActiveObserved).toBe(1);
    expect(metrics.startedCount).toBe(3);
    expect(metrics.completedCount).toBe(3);
    expect(mocks.uploadPdf).toHaveBeenCalledTimes(3);
  });

  it("fails safely and records lifecycle evidence when the cache-miss envelope is overloaded", async () => {
    process.env.CRP_PACKET_PDF_CACHE_MISS_MAX_CONCURRENCY = "1";
    process.env.CRP_PACKET_PDF_CACHE_MISS_PENDING_LIMIT = "1";
    process.env.CRP_PACKET_PDF_CACHE_MISS_TIMEOUT_MS = "1000";
    const blockedRender = deferred<string>();
    const renderBase64 = vi.fn(() => blockedRender.promise);

    const first = getOrRenderPacketPdfBase64({
      packetId: 606,
      userId: 10,
      purpose: "download",
      packetContent: packetContent("Overload first render."),
      renderBase64,
    });
    await vi.waitFor(() => expect(renderBase64).toHaveBeenCalledTimes(1));

    await expect(
      getOrRenderPacketPdfBase64({
        packetId: 607,
        userId: 10,
        purpose: "download",
        packetContent: packetContent("Overload rejected render."),
        renderBase64: vi.fn(async () => Buffer.from("%PDF-should-not-render").toString("base64")),
      }),
    ).rejects.toThrow(PacketPdfCacheMissOverloadedError);

    blockedRender.resolve(Buffer.from("%PDF-overload-first").toString("base64"));
    await first;

    const metrics = getPacketPdfCacheMissEnvelopeMetrics();
    expect(metrics.overloadRejectedCount).toBe(1);
    expect(mocks.uploadPdf).toHaveBeenCalledTimes(1);
    expect(mocks.events.map((event) => event.eventType)).toEqual([
      PACKET_PDF_RENDER_ATTEMPT_EVENT,
      PACKET_PDF_RENDER_ATTEMPT_EVENT,
      PACKET_PDF_RENDER_FAILED_EVENT,
      PACKET_PDF_RENDER_SUCCEEDED_EVENT,
    ]);
  });

  it("times out cache-miss renders before upload and records failure evidence", async () => {
    process.env.CRP_PACKET_PDF_CACHE_MISS_MAX_CONCURRENCY = "1";
    process.env.CRP_PACKET_PDF_CACHE_MISS_PENDING_LIMIT = "2";
    process.env.CRP_PACKET_PDF_CACHE_MISS_TIMEOUT_MS = "100";

    await expect(
      getOrRenderPacketPdfBase64({
        packetId: 608,
        userId: 10,
        purpose: "download",
        packetContent: packetContent("Timeout proof."),
        renderBase64: vi.fn(async () => {
          await delay(150);
          return Buffer.from("%PDF-too-late").toString("base64");
        }),
      }),
    ).rejects.toThrow(PacketPdfCacheMissTimeoutError);

    await delay(75);
    const metrics = getPacketPdfCacheMissEnvelopeMetrics();
    expect(metrics.timeoutCount).toBe(1);
    expect(metrics.failedCount).toBe(1);
    expect(mocks.uploadPdf).not.toHaveBeenCalled();
    expect(mocks.events.map((event) => event.eventType)).toEqual([
      PACKET_PDF_RENDER_ATTEMPT_EVENT,
      PACKET_PDF_RENDER_FAILED_EVENT,
    ]);
  });

  it("does not release a timed-out non-abortable render slot until the render promise settles", async () => {
    process.env.CRP_PACKET_PDF_CACHE_MISS_MAX_CONCURRENCY = "1";
    process.env.CRP_PACKET_PDF_CACHE_MISS_PENDING_LIMIT = "2";
    process.env.CRP_PACKET_PDF_CACHE_MISS_TIMEOUT_MS = "30";
    const firstRender = deferred<string>();
    const firstRenderBase64 = vi.fn(() => firstRender.promise);
    const secondRenderBase64 = vi.fn(async () => Buffer.from("%PDF-second-after-timeout").toString("base64"));

    const first = getOrRenderPacketPdfBase64({
      packetId: 609,
      userId: 10,
      purpose: "download",
      packetContent: packetContent("Held timeout slot."),
      renderBase64: firstRenderBase64,
    });
    await vi.waitFor(() => expect(firstRenderBase64).toHaveBeenCalledTimes(1));
    await expect(first).rejects.toThrow(PacketPdfCacheMissTimeoutError);

    let metrics = getPacketPdfCacheMissEnvelopeMetrics();
    expect(metrics.activeRenders).toBe(1);
    expect(metrics.inFlightKeys).toBe(1);
    expect(metrics.timeoutCount).toBe(1);

    const second = getOrRenderPacketPdfBase64({
      packetId: 610,
      userId: 10,
      purpose: "download",
      packetContent: packetContent("Queued behind timed-out render."),
      renderBase64: secondRenderBase64,
    });
    await delay(50);
    expect(secondRenderBase64).not.toHaveBeenCalled();
    expect(getPacketPdfCacheMissEnvelopeMetrics().queuedWaiters).toBe(1);

    firstRender.resolve(Buffer.from("%PDF-first-too-late").toString("base64"));
    await vi.waitFor(() => expect(secondRenderBase64).toHaveBeenCalledTimes(1));
    await second;

    metrics = getPacketPdfCacheMissEnvelopeMetrics();
    expect(metrics.activeRenders).toBe(0);
    expect(metrics.inFlightKeys).toBe(0);
    expect(metrics.maxActiveObserved).toBe(1);
    expect(mocks.uploadPdf).toHaveBeenCalledTimes(1);
  });

  it("does not accumulate uncontrolled render work after repeated timeout pressure", async () => {
    process.env.CRP_PACKET_PDF_CACHE_MISS_MAX_CONCURRENCY = "1";
    process.env.CRP_PACKET_PDF_CACHE_MISS_PENDING_LIMIT = "1";
    process.env.CRP_PACKET_PDF_CACHE_MISS_TIMEOUT_MS = "25";
    const firstRender = deferred<string>();
    const firstRenderBase64 = vi.fn(() => firstRender.promise);
    const rejectedRenderBase64 = vi.fn(async () => Buffer.from("%PDF-should-not-render").toString("base64"));

    const first = getOrRenderPacketPdfBase64({
      packetId: 611,
      userId: 10,
      purpose: "download",
      packetContent: packetContent("Timeout pressure first render."),
      renderBase64: firstRenderBase64,
    });
    await vi.waitFor(() => expect(firstRenderBase64).toHaveBeenCalledTimes(1));
    await expect(first).rejects.toThrow(PacketPdfCacheMissTimeoutError);

    const rejected = await Promise.allSettled(
      [612, 613, 614].map((packetId) =>
        getOrRenderPacketPdfBase64({
          packetId,
          userId: 10,
          purpose: "download",
          packetContent: packetContent(`Timeout pressure rejected ${packetId}.`),
          renderBase64: rejectedRenderBase64,
        }),
      ),
    );

    expect(rejected.every((result) => result.status === "rejected")).toBe(true);
    expect(rejectedRenderBase64).not.toHaveBeenCalled();
    let metrics = getPacketPdfCacheMissEnvelopeMetrics();
    expect(metrics.activeRenders).toBe(1);
    expect(metrics.overloadRejectedCount).toBe(3);
    expect(metrics.maxActiveObserved).toBe(1);

    firstRender.resolve(Buffer.from("%PDF-first-too-late").toString("base64"));
    await vi.waitFor(() => expect(getPacketPdfCacheMissEnvelopeMetrics().activeRenders).toBe(0));
    metrics = getPacketPdfCacheMissEnvelopeMetrics();
    expect(metrics.inFlightKeys).toBe(0);
    expect(mocks.uploadPdf).not.toHaveBeenCalled();
  });
});
