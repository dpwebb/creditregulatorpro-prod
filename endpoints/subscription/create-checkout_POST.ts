import { schema, OutputType } from "./create-checkout_POST.schema";
import { db } from "../../helpers/db";
import { handleEndpointError, OriginNotAllowedError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { getOrCreateStripeCustomer, createStripeSubscription, cancelStripeSubscription } from "../../helpers/stripeServer";
import { validateOrigin } from "../../helpers/domainGuard";
import { resolveSubscriptionPriceCad } from "../../helpers/subscriptionPricing";

export async function handle(request: Request) {
  try {
    const guardResult = await validateOrigin(request);
    if (!guardResult.valid && guardResult.mode === "enforce") {
      throw new OriginNotAllowedError();
    }

    const { user } = await getServerUserSession(request);
    const json = JSON.parse(await request.text());
    const { plan } = schema.parse(json);

    const prodModeSetting = await db
      .selectFrom("systemSettings")
      .select("value")
      .where("key", "=", "production_mode")
      .executeTakeFirst();

    if (prodModeSetting?.value === "false") {
      return new Response(
        JSON.stringify({ error: "Upgrades are not yet available. The app is still in trial setup mode." }),
        { status: 400 }
      );
    }

    const sub = await db
      .selectFrom("subscriptions")
      .selectAll()
      .where("userId", "=", user.id)
      .executeTakeFirst();

    // Block only if the subscription is genuinely active (payment completed)
    if (
      sub &&
      (sub.plan === "monthly" || sub.plan === "annual") &&
      sub.status === "active" &&
      sub.stripeSubscriptionId !== null
    ) {
      return new Response(
        JSON.stringify({ error: "User already has an active paid subscription." }),
        { status: 400 }
      );
    }

    // Handle abandoned checkouts: stripeSubscriptionId exists but payment was never completed
    // (status is trialing and currentPeriodStart is null means the subscription was never activated)
    if (
      sub &&
      sub.stripeSubscriptionId !== null &&
      sub.status === "trialing" &&
      sub.currentPeriodStart === null
    ) {
      console.log(`Cancelling abandoned Stripe subscription ${sub.stripeSubscriptionId} for user ${user.id}`);
      try {
        await cancelStripeSubscription(sub.stripeSubscriptionId);
      } catch (cancelError) {
        console.error("Failed to cancel abandoned Stripe subscription:", cancelError instanceof Error ? cancelError.message : cancelError);
        // Continue even if cancel fails — it may already be cancelled on Stripe's side
      }
    }

    const pricingSettings = await db
      .selectFrom("systemSettings")
      .select(["key", "value"])
      .where("key", "in", ["subscription_monthly_price_cad", "subscription_annual_price_cad"])
      .execute();

    const monthlyPriceSetting = pricingSettings.find((s) => s.key === "subscription_monthly_price_cad");
    const annualPriceSetting = pricingSettings.find((s) => s.key === "subscription_annual_price_cad");

    const monthlyPrice = resolveSubscriptionPriceCad(monthlyPriceSetting?.value, "monthly");
    const annualPrice = resolveSubscriptionPriceCad(annualPriceSetting?.value, "annual");

    const priceCad = plan === "monthly" ? monthlyPrice.toFixed(2) : annualPrice.toFixed(2);
    const amount = plan === "monthly" ? monthlyPrice : annualPrice;
    const amountCents = Math.round(amount * 100);

    const customerId = await getOrCreateStripeCustomer(user.id, user.email, user.displayName ?? undefined);

    const stripeSub = await createStripeSubscription(customerId, plan, amountCents);

    const latestInvoice = stripeSub.latest_invoice;
    let clientSecret = "";

    if (latestInvoice && typeof latestInvoice !== "string") {
      const paymentIntent = latestInvoice.payment_intent;
      if (paymentIntent && typeof paymentIntent !== "string") {
        clientSecret = paymentIntent.client_secret || "";
      }
    }

    if (!clientSecret) {
      throw new Error("Failed to retrieve payment intent client secret from Stripe subscription.");
    }

    return new Response(
      JSON.stringify({
        clientSecret,
        subscriptionId: stripeSub.id,
        plan,
        amount,
      } satisfies OutputType)
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}
