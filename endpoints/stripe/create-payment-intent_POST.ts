import { schema, OutputType } from "./create-payment-intent_POST.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { createMailPaymentIntent } from "../../helpers/stripeServer";
import { getPostalPricingFromDB } from "../../helpers/getPostalPricingFromDB";
import { checkRateLimit, RateLimitConfig } from "../../helpers/rateLimiter";
import { db } from "../../helpers/db";

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
      .select(["plan"])
      .where("userId", "=", user.id)
      .orderBy("createdAt", "desc")
      .limit(1)
      .executeTakeFirst();

    const isBetaUser = latestSubscription?.plan === "beta" || user.subscriptionPlan === "beta";

    if (isBetaUser) {
      return new Response(
        JSON.stringify({
          clientSecret: null,
          paymentIntentId: null,
          isBeta: true,
          amount: 0,
        } satisfies OutputType)
      );
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
