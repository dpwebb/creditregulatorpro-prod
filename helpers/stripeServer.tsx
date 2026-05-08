import Stripe from "stripe";
import { db } from "./db";

let _stripe: Stripe | null = null;

/** Lazily initialised Stripe client – throws only when first called, not at import time. */
export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("Missing STRIPE_SECRET_KEY environment variable");
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
    });
  }
  return _stripe;
}

export async function createMailPaymentIntent(
  userId: number,
  packetId: number,
  amountCad: number
) {
  const amountInCents = Math.round(amountCad * 100);

  const paymentIntent = await getStripe().paymentIntents.create({
    amount: amountInCents,
    currency: "cad",
    metadata: {
      userId: userId.toString(),
      packetId: packetId.toString(),
      totalCad: amountCad.toFixed(2),
    },
  });

  return paymentIntent;
}

export async function createRegisteredMailPaymentIntent(
  userId: number,
  packetId: number,
  pricing?: { baseCost: number; surchargeRate: number }
) {
  const base = pricing?.baseCost ?? 4.99;
  const rate = pricing?.surchargeRate ?? 0.10;
  const surcharge = base * rate;
  const total = base + surcharge;

  const paymentIntent = await getStripe().paymentIntents.create({
    amount: Math.round(total * 100),
    currency: "cad",
    metadata: {
      userId: userId.toString(),
      packetId: packetId.toString(),
      baseCostCad: base.toFixed(2),
      surchargeCad: surcharge.toFixed(2),
      totalCad: total.toFixed(2),
    },
  });

  return paymentIntent;
}

export async function verifyPaymentIntent(paymentIntentId: string) {
    const paymentIntent = await getStripe().paymentIntents.retrieve(paymentIntentId);

  if (paymentIntent.status !== "succeeded") {
    throw new Error(`PaymentIntent ${paymentIntentId} has not succeeded. Current status: ${paymentIntent.status}`);
  }

  return paymentIntent;
}

export async function refundPaymentIntent(paymentIntentId: string) {
    const refund = await getStripe().refunds.create({
    payment_intent: paymentIntentId,
  });

  return refund;
}

export async function getOrCreateStripeCustomer(userId: number, email: string, name?: string) {
  const sub = await db
    .selectFrom("subscriptions")
    .select(["id", "stripeCustomerId"])
    .where("userId", "=", userId)
    .executeTakeFirst();

  if (sub?.stripeCustomerId) {
    return sub.stripeCustomerId;
  }

  const customer = await getStripe().customers.create({
    email,
    name,
    metadata: { userId: userId.toString() },
  });

  if (sub) {
    await db
      .updateTable("subscriptions")
      .set({ stripeCustomerId: customer.id })
      .where("id", "=", sub.id)
      .execute();
  } else {
    await db
      .insertInto("subscriptions")
      .values({
        userId,
        stripeCustomerId: customer.id,
      })
      .execute();
  }

  return customer.id;
}

let _productId: string | null = null;
let _pricesCache: Record<string, string> = {};

async function getOrCreateProduct(): Promise<string> {
  if (_productId) return _productId;
  const stripe = getStripe();
  const products = await stripe.products.list({ active: true, limit: 100 });
  let product = products.data.find((p) => p.name === "Credit Regulator Pro Subscription");
  if (!product) {
    product = await stripe.products.create({ name: "Credit Regulator Pro Subscription" });
  }
  _productId = product.id;
  return _productId;
}

async function getOrCreatePrice(plan: "monthly" | "annual", productId: string, amountCents: number): Promise<string> {
  const cacheKey = `${plan}-${productId}-${amountCents}`;
  if (_pricesCache[cacheKey]) return _pricesCache[cacheKey];

  const stripe = getStripe();
  const interval = plan === "monthly" ? "month" : "year";

  const prices = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  let price = prices.data.find(
    (p) => p.unit_amount === amountCents && p.recurring?.interval === interval && p.currency === "cad"
  );

  if (!price) {
    // Remove any stale cache entries for this plan+product combo before creating a new price
    for (const key of Object.keys(_pricesCache)) {
      if (key.startsWith(`${plan}-${productId}-`)) {
        delete _pricesCache[key];
      }
    }
    price = await stripe.prices.create({
      product: productId,
      unit_amount: amountCents,
      currency: "cad",
      recurring: { interval },
    });
  }

  _pricesCache[cacheKey] = price.id;
  return price.id;
}

export async function createStripeSubscription(
  customerId: string,
  plan: "monthly" | "annual",
  amountCents: number,
  userId?: number
) {
  const productId = await getOrCreateProduct();
  const priceId = await getOrCreatePrice(plan, productId, amountCents);

  const subscription = await getStripe().subscriptions.create({
    customer: customerId,
    items: [
      {
        price: priceId,
      },
    ],
    payment_behavior: "default_incomplete",
    metadata: {
      plan,
      ...(userId ? { userId: userId.toString() } : {}),
    },
    expand: ["latest_invoice.payment_intent"],
  });

  return subscription;
}

export async function cancelStripeSubscription(stripeSubscriptionId: string) {
  return await getStripe().subscriptions.cancel(stripeSubscriptionId);
}

export async function updateStripeSubscriptionPlan(stripeSubscriptionId: string, newPlan: "monthly" | "annual", amountCents: number) {
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  
  if (!subscription.items.data.length) {
    throw new Error("No subscription items found");
  }

  const subscriptionItemId = subscription.items.data[0].id;
  const oldPrice = subscription.items.data[0].price;
  let productId = typeof oldPrice.product === "string" ? oldPrice.product : oldPrice.product?.id;

  if (!productId) {
    productId = await getOrCreateProduct();
  }

  const priceId = await getOrCreatePrice(newPlan, productId, amountCents);

  return await stripe.subscriptions.update(stripeSubscriptionId, {
    items: [
      {
        id: subscriptionItemId,
        price: priceId,
      },
    ],
    proration_behavior: "create_prorations",
  });
}

export async function retrieveStripeSubscription(stripeSubscriptionId: string) {
  return await getStripe().subscriptions.retrieve(stripeSubscriptionId);
}
