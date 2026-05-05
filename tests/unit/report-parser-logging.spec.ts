import { describe, expect, it, vi } from "vitest";

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
});
