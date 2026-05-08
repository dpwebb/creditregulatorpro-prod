import { describe, expect, it } from "vitest";
import { evaluateSubscriptionAccess } from "../../helpers/subscriptionAccess";

const now = new Date("2026-05-08T12:00:00Z");

describe("subscription access evaluation", () => {
  it("allows active beta trials before trial end", () => {
    const result = evaluateSubscriptionAccess(
      {
        role: "user",
        subscriptionPlan: "beta",
        subscriptionStatus: "trialing",
        trialEnd: "2026-05-09T12:00:00Z",
      },
      now
    );

    expect(result.blocked).toBe(false);
    expect(result.reason).toBe("active_trial");
  });

  it("blocks beta users after trial end", () => {
    const result = evaluateSubscriptionAccess(
      {
        role: "user",
        subscriptionPlan: "beta",
        subscriptionStatus: "trialing",
        trialEnd: "2026-05-07T12:00:00Z",
      },
      now
    );

    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("trial_expired");
    expect(result.title).toBe("Free Trial Expired");
  });

  it("allows active paid subscriptions even when the old trial end is past", () => {
    const result = evaluateSubscriptionAccess(
      {
        role: "user",
        subscriptionPlan: "monthly",
        subscriptionStatus: "active",
        trialEnd: "2026-05-07T12:00:00Z",
      },
      now
    );

    expect(result.blocked).toBe(false);
    expect(result.reason).toBe("active_paid");
  });

  it("blocks inactive paid subscription states", () => {
    const result = evaluateSubscriptionAccess(
      {
        role: "user",
        subscriptionPlan: "annual",
        subscriptionStatus: "past_due",
        trialEnd: "2026-06-01T12:00:00Z",
      },
      now
    );

    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("inactive_status");
  });

  it("always allows staff roles", () => {
    const result = evaluateSubscriptionAccess(
      {
        role: "admin",
        subscriptionPlan: null,
        subscriptionStatus: null,
        trialEnd: null,
      },
      now
    );

    expect(result.blocked).toBe(false);
    expect(result.reason).toBe("staff");
  });
});
