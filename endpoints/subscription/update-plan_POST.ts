import { schema, OutputType } from "./update-plan_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { updateStripeSubscriptionPlan } from "../../helpers/stripeServer";


export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const json = JSON.parse(await request.text());
    const { plan } = schema.parse(json);

    // Check production_mode setting
    const productionModeSetting = await db
      .selectFrom("systemSettings")
      .select("value")
      .where("key", "=", "production_mode")
      .executeTakeFirst();

    const isProductionMode = productionModeSetting?.value === "true";
    if (!isProductionMode) {
      return new Response(
        JSON.stringify({
          error: "Subscription management is not available yet. The app is currently in beta mode.",
        }),
        { status: 400 }
      );
    }

    const subscription = await db
      .selectFrom("subscriptions")
      .selectAll()
      .where("userId", "=", user.id)
      .executeTakeFirst();

    if (!subscription) {
      return new Response(JSON.stringify({ error: "No active subscription found. Please refresh." }), {
        status: 400,
      });
    }

    if (subscription.plan === "beta") {
      return new Response(
        JSON.stringify({
          error: "Beta users will be upgraded when the app enters production mode.",
        }),
        { status: 400 }
      );
    }

    const pricingSettings = await db
      .selectFrom("systemSettings")
      .select(["key", "value"])
      .where("key", "in", ["subscription_monthly_price_cad", "subscription_annual_price_cad"])
      .execute();

    const monthlyPriceSetting = pricingSettings.find((s) => s.key === "subscription_monthly_price_cad");
    const annualPriceSetting = pricingSettings.find((s) => s.key === "subscription_annual_price_cad");

    const monthlyPrice = monthlyPriceSetting && !isNaN(parseFloat(monthlyPriceSetting.value))
            ? parseFloat(monthlyPriceSetting.value)
      : 19.00;
    const annualPrice = annualPriceSetting && !isNaN(parseFloat(annualPriceSetting.value))
      ? parseFloat(annualPriceSetting.value)
      : 49.99;

    const price = plan === "monthly" ? monthlyPrice : annualPrice;
    const priceCad = price.toFixed(2);
    const amountCents = Math.round(price * 100);

    // Update Stripe subscription plan if a Stripe subscription exists
    if (subscription.stripeSubscriptionId) {
      console.log(
        `Updating Stripe subscription ${subscription.stripeSubscriptionId} for user ${user.id} to plan ${plan}`
      );
      await updateStripeSubscriptionPlan(subscription.stripeSubscriptionId, plan, amountCents);
      console.log(`Stripe subscription ${subscription.stripeSubscriptionId} updated to ${plan} successfully`);
    }

    const now = new Date();

    const updatedSubscription = await db
      .updateTable("subscriptions")
      .set({
        plan,
        priceCad,
        status: "active",
        updatedAt: now,
      })
      .where("id", "=", subscription.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return new Response(JSON.stringify(updatedSubscription satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}