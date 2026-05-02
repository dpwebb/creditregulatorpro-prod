import { schema, OutputType } from "./confirm-payment_POST.schema";
import { db } from "../../helpers/db";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { retrieveStripeSubscription } from "../../helpers/stripeServer";
import { sendGridEmail } from "../../helpers/sendGridEmail";
import { resolveSubscriptionPriceCad } from "../../helpers/subscriptionPricing";

async function resolvePriceCad(plan: "monthly" | "annual"): Promise<string> {
  const pricingSettings = await db
    .selectFrom("systemSettings")
    .select(["key", "value"])
    .where("key", "in", ["subscription_monthly_price_cad", "subscription_annual_price_cad"])
    .execute();

  const monthlyPriceSetting = pricingSettings.find((s) => s.key === "subscription_monthly_price_cad");
  const annualPriceSetting = pricingSettings.find((s) => s.key === "subscription_annual_price_cad");

  const monthlyPrice = resolveSubscriptionPriceCad(monthlyPriceSetting?.value, "monthly");
  const annualPrice = resolveSubscriptionPriceCad(annualPriceSetting?.value, "annual");

  return plan === "monthly" ? monthlyPrice.toFixed(2) : annualPrice.toFixed(2);
}

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    // Parse input from JSON
    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    // Call Stripe to get latest status before touching the DB
    const stripeSub = await retrieveStripeSubscription(input.stripeSubscriptionId);

    const isStripeActive = stripeSub.status === "active" || stripeSub.status === "trialing";

    if (!isStripeActive) {
      throw new BusinessRuleError(
        `Stripe subscription is not active. Current status: ${stripeSub.status}`,
        400
      );
    }

    // Derive values from Stripe response
    const currentPeriodStart = new Date(stripeSub.current_period_start * 1000);
    const currentPeriodEnd = new Date(stripeSub.current_period_end * 1000);
    const stripeCustomerId =
      typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer?.id ?? null;

    const priceCad = await resolvePriceCad(input.plan);
    const now = new Date();

    // Look up existing subscription by userId only
    const dbSub = await db
      .selectFrom("subscriptions")
      .selectAll()
      .where("userId", "=", user.id)
      .executeTakeFirst();

    let updatedSub: OutputType;

    if (dbSub) {
      console.log(`Confirming payment for existing subscription record ${dbSub.id} for user ${user.id}`);
      updatedSub = await db
        .updateTable("subscriptions")
        .set({
          plan: input.plan,
          priceCad,
          status: "active",
          stripeSubscriptionId: input.stripeSubscriptionId,
          stripeCustomerId,
          currentPeriodStart,
          currentPeriodEnd,
          trialEnd: now,
          updatedAt: now,
        })
        .where("id", "=", dbSub.id)
        .returningAll()
        .executeTakeFirstOrThrow();
    } else {
      console.log(`No existing subscription record for user ${user.id}. Inserting new record.`);
      updatedSub = await db
        .insertInto("subscriptions")
        .values({
          userId: user.id,
          plan: input.plan,
          priceCad,
          status: "active",
          stripeSubscriptionId: input.stripeSubscriptionId,
          stripeCustomerId,
          currentPeriodStart,
          currentPeriodEnd,
          trialEnd: now,
          updatedAt: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    }

    // Send confirmation email — non-blocking, errors are logged but don't fail the response
    const planLabel = input.plan === "monthly" ? "Monthly" : "Annual";
    const periodStart = updatedSub.currentPeriodStart instanceof Date
      ? updatedSub.currentPeriodStart
      : updatedSub.currentPeriodStart
        ? new Date(updatedSub.currentPeriodStart)
        : null;
    const periodEnd = updatedSub.currentPeriodEnd instanceof Date
      ? updatedSub.currentPeriodEnd
      : updatedSub.currentPeriodEnd
        ? new Date(updatedSub.currentPeriodEnd)
        : null;

    const formatDate = (d: Date | null) =>
      d
        ? d.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" })
        : "N/A";

    const emailHtml = `
<p>Hi there,</p>
<p>Thank you for subscribing to <strong>Credit Regulator Pro</strong>!</p>
<p>Here are your subscription details:</p>
<ul>
  <li><strong>Plan:</strong> ${planLabel}</li>
  <li><strong>Price:</strong> $${updatedSub.priceCad} CAD</li>
  <li><strong>Billing Period:</strong> ${formatDate(periodStart)} to ${formatDate(periodEnd)}</li>
</ul>
<p>You now have full access to all the tools you need to manage and improve your credit profile.</p>
<p>If you have any questions, feel free to reach out to our support team.</p>
<p>Thank you for choosing Credit Regulator Pro!</p>
`.trim();

    sendGridEmail({
      to: user.email,
      subject: "Your Credit Regulator Pro subscription is confirmed!",
      html: emailHtml,
    }).catch((emailError) => {
      console.error("Failed to send subscription confirmation email:", emailError instanceof Error ? emailError.message : emailError);
    });

    return new Response(JSON.stringify(updatedSub satisfies OutputType), {
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
