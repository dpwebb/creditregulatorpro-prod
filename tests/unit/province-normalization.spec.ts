import { describe, expect, it } from "vitest";

import { normalizeProvinceCode } from "../../helpers/canadianJurisdictions";
import { calculateRetentionExpiry } from "../../helpers/provincialRetentionCalculator";

describe("province normalization", () => {
  it("normalizes full province names to Canadian province codes", () => {
    expect(normalizeProvinceCode("Nova Scotia")).toBe("NS");
    expect(normalizeProvinceCode("ns")).toBe("NS");
    expect(normalizeProvinceCode("Quebec")).toBe("QC");
    expect(normalizeProvinceCode("Newfoundland and Labrador")).toBe("NL");
  });

  it("uses Nova Scotia retention years after normalization", () => {
    const province = normalizeProvinceCode("Nova Scotia");
    expect(province).toBe("NS");

    const result = calculateRetentionExpiry(
      province!,
      "collection",
      new Date("2020-08-09T00:00:00.000Z"),
      false,
      undefined,
      new Date("2026-05-07T00:00:00.000Z"),
    );

    expect(result?.retentionYears).toBe(6);
    expect(result?.expiryDate.toISOString()).toBe("2026-08-09T00:00:00.000Z");
    expect(result?.isExpired).toBe(false);
  });
});

