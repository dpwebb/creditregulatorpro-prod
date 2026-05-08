import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const selectBuilder: Record<string, any> = {};
  selectBuilder.selectAll = vi.fn(() => selectBuilder);
  selectBuilder.where = vi.fn(() => selectBuilder);
  selectBuilder.executeTakeFirst = vi.fn();

  const updateBuilder: Record<string, any> = {};
  updateBuilder.set = vi.fn(() => updateBuilder);
  updateBuilder.where = vi.fn(() => updateBuilder);
  updateBuilder.returningAll = vi.fn(() => updateBuilder);
  updateBuilder.executeTakeFirstOrThrow = vi.fn();

  const insertBuilder: Record<string, any> = {};
  insertBuilder.values = vi.fn(() => insertBuilder);
  insertBuilder.returningAll = vi.fn(() => insertBuilder);
  insertBuilder.executeTakeFirstOrThrow = vi.fn();

  return {
    db: {
      selectFrom: vi.fn(() => selectBuilder),
      updateTable: vi.fn(() => updateBuilder),
      insertInto: vi.fn(() => insertBuilder),
    },
    selectBuilder,
    updateBuilder,
    insertBuilder,
  };
});

vi.mock("../../helpers/db", () => ({
  db: mocks.db,
}));

import {
  inferStripeSubscriptionPlan,
  mapStripeSubscriptionStatus,
  syncStripeSubscriptionToDb,
} from "../../helpers/stripeSubscriptionSync";

function stripeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_123",
    status: "active",
    customer: "cus_123",
    current_period_start: 1_777_824_000,
    current_period_end: 1_780_416_000,
    trial_start: null,
    trial_end: null,
    canceled_at: null,
    cancellation_details: { reason: null },
    metadata: { plan: "annual", userId: "42" },
    items: {
      data: [
        {
          price: {
            recurring: { interval: "year" },
            unit_amount: 9900,
          },
        },
      ],
    },
    ...overrides,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.selectBuilder.executeTakeFirst.mockResolvedValue(undefined);
  mocks.updateBuilder.executeTakeFirstOrThrow.mockResolvedValue({
    id: 7,
    userId: 42,
  });
  mocks.insertBuilder.executeTakeFirstOrThrow.mockResolvedValue({
    id: 8,
    userId: 42,
  });
});

describe("Stripe subscription sync", () => {
  it("maps Stripe statuses into local subscription statuses", () => {
    expect(mapStripeSubscriptionStatus("active")).toBe("active");
    expect(mapStripeSubscriptionStatus("trialing")).toBe("trialing");
    expect(mapStripeSubscriptionStatus("canceled")).toBe("cancelled");
    expect(mapStripeSubscriptionStatus("incomplete_expired")).toBe("expired");
    expect(mapStripeSubscriptionStatus("unpaid")).toBe("past_due");
  });

  it("infers local plans from metadata before recurring interval", () => {
    expect(inferStripeSubscriptionPlan(stripeSubscription({ metadata: { plan: "monthly" } }))).toBe("monthly");
    expect(inferStripeSubscriptionPlan(stripeSubscription({ metadata: {}, items: { data: [{ price: { recurring: { interval: "year" }, unit_amount: 9900 } }] } }))).toBe("annual");
  });

  it("updates an existing local subscription from a Stripe subscription event", async () => {
    mocks.selectBuilder.executeTakeFirst.mockResolvedValueOnce({
      id: 7,
      userId: 42,
      plan: "beta",
      priceCad: null,
      trialEnd: new Date("2026-05-01T00:00:00Z"),
      cancelledAt: null,
      cancelReason: null,
    });

    const result = await syncStripeSubscriptionToDb(stripeSubscription());

    expect(result).toMatchObject({ updated: true, subscriptionId: "sub_123", userId: 42 });
    expect(mocks.db.updateTable).toHaveBeenCalledWith("subscriptions");
    expect(mocks.updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: "annual",
        status: "active",
        stripeSubscriptionId: "sub_123",
        stripeCustomerId: "cus_123",
        priceCad: "99.00",
      })
    );
  });

  it("inserts a subscription when Stripe metadata has a user id and no local row exists", async () => {
    const result = await syncStripeSubscriptionToDb(stripeSubscription());

    expect(result).toMatchObject({ updated: true, subscriptionId: "sub_123", userId: 42 });
    expect(mocks.db.insertInto).toHaveBeenCalledWith("subscriptions");
    expect(mocks.insertBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        plan: "annual",
        status: "active",
        stripeSubscriptionId: "sub_123",
        stripeCustomerId: "cus_123",
      })
    );
  });
});
