import { describe, expect, it } from "vitest";

import { simulateRateLimitPressure } from "../../scripts/production-scale-harness.mjs";

describe("simulated rate limiter pressure evidence", () => {
  it("creates accepted and rejected counts without sending traffic or mutating the rate-limit table", () => {
    const report = simulateRateLimitPressure({
      attempts: 10,
      maxAttempts: 4,
      identifier: "SIMULATED_RATE_LIMIT_TEST_SUBJECT",
    });

    expect(report).toMatchObject({
      evidenceType: "SIMULATED",
      identifier: "SIMULATED_RATE_LIMIT_TEST_SUBJECT",
      attempts: 10,
      maxAttempts: 4,
      acceptedCount: 4,
      rejectedCount: 6,
      simulatedWritePressureEvents: 10,
      realTrafficSent: false,
      databaseMutated: false,
    });
    expect(report.decisions.filter((item) => item.allowed)).toHaveLength(4);
    expect(report.decisions.filter((item) => !item.allowed)).toHaveLength(6);
  });
});
