import { describe, expect, it } from "vitest";

import {
  formatPacketAccountIdentifier,
  formatPacketConsumerEvidenceReference,
  formatPacketDisplayDate,
  formatPacketExpectedValue,
  formatPacketFieldLabel,
  redactPacketSensitiveText,
  PACKET_REQUESTED_RESULT_FALLBACK,
} from "../../helpers/disputePacketHumanization";

describe("dispute packet humanization display helpers", () => {
  it("turns internal field keys into readable labels", () => {
    expect(formatPacketFieldLabel("LasReportedDate")).toBe("Date last reported");
    expect(formatPacketFieldLabel("Lastreporteddate")).toBe("Date last reported");
    expect(formatPacketFieldLabel("lastReportedDate")).toBe("Date last reported");
    expect(formatPacketFieldLabel("last_reported_date")).toBe("Date last reported");
    expect(formatPacketFieldLabel("Date last reported")).toBe("Date last reported");
    expect(formatPacketFieldLabel("reportedDate")).toBe("Date reported by the bureau");
    expect(formatPacketFieldLabel("dateReported")).toBe("Date reported by the bureau");
    expect(formatPacketFieldLabel("Date reported by the bureau")).toBe("Date reported by the bureau");
    expect(formatPacketFieldLabel("account_number")).toBe("Account");
    expect(formatPacketFieldLabel("currentBalance")).toBe("Balance reported");
    expect(formatPacketFieldLabel("Balance reported")).toBe("Balance reported");
    expect(formatPacketFieldLabel("creditorName")).toBe("Company reporting the account");
    expect(formatPacketFieldLabel("customInternalCamelKey")).toBe("Custom Internal Camel Key");
  });

  it("renders ISO dates without timezone drift", () => {
    expect(formatPacketDisplayDate("2012-08-21T00:00:00.000Z")).toBe("Aug 21, 2012");
    expect(formatPacketDisplayDate("")).toBe("Information not provided on report");
    expect(formatPacketDisplayDate("not-a-date")).toBe("Information not provided on report");
  });

  it("rejects invalid account fragments and uses safe fallbacks", () => {
    expect(formatPacketAccountIdentifier("123456789012")).toBe("Account ending 9012");
    expect(formatPacketAccountIdentifier("reau")).toBe("Account identifier unavailable");
    expect(formatPacketAccountIdentifier(null)).toBe("Account number not provided on report");
    expect(formatPacketAccountIdentifier("not reported")).toBe("Account number not provided on report");
  });

  it("does not emit Expected: Not known when no reliable corrected value exists", () => {
    const display = formatPacketExpectedValue("balance", "Not known");
    expect(display).toBe(PACKET_REQUESTED_RESULT_FALLBACK);
    expect(display).not.toMatch(/Expected:\s*Not known|Not known/i);
  });

  it("returns consumer-safe evidence references without raw internal IDs", () => {
    const display = formatPacketConsumerEvidenceReference({
      evidenceReference: "Source report #7; field: balance; page 2; reportArtifactId: 7; tradelineId: 20",
    });

    expect(display).toBe("Relevant report section for Balance reported on page 2.");
    expect(display).not.toMatch(/tradeline|artifact|field:|reportArtifactId|tradelineId|#7|#20/i);
  });

  it("redacts standalone raw reference IDs from consumer text", () => {
    const display = redactPacketSensitiveText("Review under PIPEDA_4_5 and BALANCE_CALCULATION_VIOLATION.");

    expect(display).toContain("the applicable reporting requirements");
    expect(display).not.toMatch(/PIPEDA_4_5|BALANCE_CALCULATION_VIOLATION/);
  });

  it("does not treat a field label alone as linked evidence", () => {
    expect(formatPacketConsumerEvidenceReference({ fieldName: "balance" })).toBe("Needs manual review");
  });
});
