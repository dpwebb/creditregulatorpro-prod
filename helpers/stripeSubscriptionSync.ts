import Stripe from "stripe";
import { db } from "./db";
import type { Selectable } from "kysely";
import type { SubscriptionPlan, SubscriptionStatus, Subscriptions } from "./schema";

export interface StripeSubscriptionSyncResult {
  updated: boolean;
  subscriptionId: string;
  userId: number | null;
  reason?: string;
}

function secondsToDate(value: number | null | undefined): Date | null {
  return typeof value === "number" ? new Date(value * 1000) : null;
}

function customerIdFromSubscription(subscription: Stripe.Subscription): string | null {
  return typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id ?? null;
}

export function mapStripeSubscriptionStatus(status: Stripe.Subscription.Status | string): SubscriptionStatus {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "canceled":
      return "cancelled";
    case "incomplete_expired":
      return "expired";
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "paused":
    default:
      return "past_due";
  }
}

export function inferStripeSubscriptionPlan(subscription: Stripe.Subscription): SubscriptionPlan | null {
  const metadataPlan = subscription.metadata?.plan;
  if (metadataPlan === "monthly" || metadataPlan === "annual") {
    return metadataPlan;
  }

  const interval = subscription.items.data[0]?.price.recurring?.interval;
  if (interval === "month") return "monthly";
  if (interval === "year") return "annual";

  return null;
}

function inferPriceCad(subscription: Stripe.Subscription): string | null {
  const unitAmount = subscription.items.data[0]?.price.unit_amount;
  return typeof unitAmount === "number" ? (unitAmount / 100).toFixed(2) : null;
}

function metadataUserId(subscription: Stripe.Subscription): number | null {
  const raw = subscription.metadata?.userId;
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function findExistingSubscription(
  stripeSubscriptionId: string,
  stripeCustomerId: string | null
): Promise<Selectable<Subscriptions> | undefined> {
  const bySubscriptionId = await db
    .selectFrom("subscriptions")
    .selectAll()
    .where("stripeSubscriptionId", "=", stripeSubscriptionId)
    .executeTakeFirst();

  if (bySubscriptionId || !stripeCustomerId) {
    return bySubscriptionId;
  }

  return await db
    .selectFrom("subscriptions")
    .selectAll()
    .where("stripeCustomerId", "=", stripeCustomerId)
    .executeTakeFirst();
}

export async function syncStripeSubscriptionToDb(
  subscription: Stripe.Subscription
): Promise<StripeSubscriptionSyncResult> {
  const stripeCustomerId = customerIdFromSubscription(subscription);
  const existing = await findExistingSubscription(subscription.id, stripeCustomerId);
  const userId = existing?.userId ?? metadataUserId(subscription);

  if (!existing && !userId) {
    return {
      updated: false,
      subscriptionId: subscription.id,
      userId: null,
      reason: "no_matching_subscription_or_user_metadata",
    };
  }

  const now = new Date();
  const status = mapStripeSubscriptionStatus(subscription.status);
  const plan = inferStripeSubscriptionPlan(subscription) ?? existing?.plan ?? "monthly";
  const priceCad = inferPriceCad(subscription) ?? existing?.priceCad ?? null;
  const currentPeriodStart = secondsToDate(subscription.current_period_start);
  const currentPeriodEnd = secondsToDate(subscription.current_period_end);
  const trialStart = secondsToDate(subscription.trial_start);
  const trialEnd = secondsToDate(subscription.trial_end) ?? existing?.trialEnd ?? now;
  const cancelledAt =
    secondsToDate(subscription.canceled_at) ??
    (status === "cancelled" ? now : existing?.cancelledAt ?? null);
  const cancelReason = subscription.cancellation_details?.reason ?? existing?.cancelReason ?? null;

  const values: Record<string, unknown> = {
    plan,
    status,
    stripeSubscriptionId: subscription.id,
    stripeCustomerId,
    priceCad,
    currentPeriodStart,
    currentPeriodEnd,
    trialEnd,
    cancelledAt,
    cancelReason,
    updatedAt: now,
  };

  if (trialStart) {
    values.trialStart = trialStart;
  }

  let saved: Selectable<Subscriptions>;

  if (existing) {
    saved = await db
      .updateTable("subscriptions")
      .set(values)
      .where("id", "=", existing.id)
      .returningAll()
      .executeTakeFirstOrThrow();
  } else {
    saved = await db
      .insertInto("subscriptions")
      .values({
        ...values,
        userId: userId!,
        trialStart: trialStart ?? now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  return {
    updated: true,
    subscriptionId: subscription.id,
    userId: saved.userId,
  };
}
