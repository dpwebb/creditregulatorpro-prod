import { describe, expect, it, vi } from "vitest";

import { handle as handlePostGridWebhook } from "../../endpoints/webhook/postgrid_POST";
import { logger } from "../../helpers/logger";
import { DEFAULT_LOG_RAW_TEXT_PREVIEW } from "../../helpers/reportParser";
import { splitIntoTradelineSections } from "../../helpers/tradelineSectionSplitter";

describe("report parser logging defaults", () => {
  it("does not log raw report text previews unless explicitly requested", () => {
    expect(DEFAULT_LOG_RAW_TEXT_PREVIEW).toBe(false);
  });

  it("does not log raw tradeline section text while splitting reports", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const sensitiveMarker = "SENSITIVE_CONSUMER_ACCOUNT_123456";

    splitIntoTradelineSections(
      [
        "Account(s):",
        "Creditor Name",
        sensitiveMarker,
        "Account Number",
        "999999",
        "Balance: 100",
        "Status: Open",
      ].join("\n"),
    );

    const loggedText = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(loggedText).not.toContain(sensitiveMarker);
  });

  it("redacts nested personal data in structured logs", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    logger.info("test", {
      consumer: {
        fullName: "TEST CONSUMER",
        dateOfBirth: "1961-01-30",
        phone: "(647) 612-7729",
        addressLine1: "101 TEST AVE",
      },
      safeFlag: true,
    });

    const loggedText = infoSpy.mock.calls.map((call) => JSON.stringify(call)).join("\n");
    expect(loggedText).not.toContain("TEST CONSUMER");
    expect(loggedText).not.toContain("1961-01-30");
    expect(loggedText).not.toContain("(647) 612-7729");
    expect(loggedText).not.toContain("101 TEST AVE");
    expect(loggedText).toContain("safeFlag");
    infoSpy.mockRestore();
  });

  it("rejects unsigned PostGrid webhooks unless explicitly allowed", async () => {
    const previousSecret = process.env.POSTGRID_WEBHOOK_SECRET;
    const previousAllow = process.env.POSTGRID_ALLOW_UNSIGNED_WEBHOOKS;
    delete process.env.POSTGRID_WEBHOOK_SECRET;
    delete process.env.POSTGRID_ALLOW_UNSIGNED_WEBHOOKS;

    try {
      const response = await handlePostGridWebhook(
        new Request("http://localhost/_api/webhook/postgrid", {
          method: "POST",
          body: JSON.stringify({ data: { id: "letter_1", status: "delivered" } }),
          headers: { "content-type": "application/json" },
        }),
      );

      expect(response.status).toBe(500);
    } finally {
      if (previousSecret === undefined) delete process.env.POSTGRID_WEBHOOK_SECRET;
      else process.env.POSTGRID_WEBHOOK_SECRET = previousSecret;
      if (previousAllow === undefined) delete process.env.POSTGRID_ALLOW_UNSIGNED_WEBHOOKS;
      else process.env.POSTGRID_ALLOW_UNSIGNED_WEBHOOKS = previousAllow;
    }
  });
});
