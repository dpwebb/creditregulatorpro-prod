import { describe, expect, it } from "vitest";

import {
  needsTermsAcceptance,
  normalizeTermsVersion,
  termsVersionsMatch,
} from "../../helpers/termsAcceptance";

describe("terms acceptance gate", () => {
  it("normalizes historical numeric and v-prefixed terms versions", () => {
    expect(normalizeTermsVersion("1.0")).toBe("1");
    expect(normalizeTermsVersion("v1")).toBe("1");
    expect(normalizeTermsVersion("version 01.00")).toBe("1");
  });

  it("treats accepted 1.0 and current v1 as the same terms version", () => {
    expect(termsVersionsMatch("1.0", "v1")).toBe(true);
    expect(
      needsTermsAcceptance({
        role: "user",
        termsAcceptedAt: "2026-04-18T00:31:26.913Z",
        termsAcceptedVersion: "1.0",
        currentTermsVersion: "v1",
      })
    ).toBe(false);
  });

  it("still requires acceptance when there is no acceptance timestamp or a real version bump", () => {
    expect(
      needsTermsAcceptance({
        role: "user",
        termsAcceptedAt: null,
        termsAcceptedVersion: null,
        currentTermsVersion: "v1",
      })
    ).toBe(true);

    expect(
      needsTermsAcceptance({
        role: "user",
        termsAcceptedAt: "2026-04-18T00:31:26.913Z",
        termsAcceptedVersion: "v1",
        currentTermsVersion: "v2",
      })
    ).toBe(true);
  });
});
