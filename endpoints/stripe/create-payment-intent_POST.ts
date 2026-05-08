import { schema, OutputType } from "./create-payment-intent_POST.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { createMailPaymentIntent } from "../../helpers/stripeServer";
import { getPostalPricingFromDB } from "../../helpers/getPostalPricingFromDB";
import { checkRateLimit, RateLimitConfig } from "../../helpers/rateLimiter";
import { db } from "../../helpers/db";
import { evaluateSubscriptionAccess, subscriptionAccessErrorResponse } from "../../helpers/subscriptionAccess";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    const rateLimitResult = await checkRateLimit(
      user.id.toString(),
      "PAYMENT_INTENT",
      RateLimitConfig.PAYMENT_INTENT.maxAttempts,
      RateLimitConfig.PAYMENT_INTENT.windowMinutes
    );
    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ error: "Too many requests. Please try again later.", resetAt: rateLimitResult.resetAt }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    const json = JSON.parse(await request.text());
    const result = schema.parse(json);

    const pricing = await getPostalPricingFromDB();

    // Use the latest subscription row for payment gating to match packet send endpoints.
    const latestSubscription = await db
      .selectFrom("subscriptions")
      .select(["plan", "status", "trialEnd"])
      .where("userId", "=", user.id)
      .orderBy("createdAt", "desc")
      .limit(1)
      .executeTakeFirst();

    const subscriptionAccess = evaluateSubscriptionAccess({
      role: user.role,
      subscriptionPlan: latestSubscription?.plan ?? user.subscriptionPlan,
      subscriptionStatus: latestSubscription?.status ?? user.subscriptionStatus,
      trialEnd: latestSubscription?.trialEnd ?? user.trialEnd,
    });

    if (subscriptionAccess.blocked) {
      return subscriptionAccessErrorResponse(subscriptionAccess);
    }

    const mailType = result.mailType ?? "registered";
    let paymentIntent;

    if (mailType === "first_class") {
      paymentIntent = await createMailPaymentIntent(
        user.id,
        result.packetId,
        pricing.firstClassCost
      );
    } else {
      paymentIntent = await createMailPaymentIntent(
        user.id,
        result.packetId,
        pricing.registeredCost
      );
    }

    return new Response(
      JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        isBeta: false,
        amount: paymentIntent.amount,
      } satisfies OutputType)
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}
