import { schema, OutputType } from "./cancel_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { cancelStripeSubscription } from "../../helpers/stripeServer";


export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const json = JSON.parse(await request.text());
    const { reason } = schema.parse(json);

    const subscription = await db
      .selectFrom("subscriptions")
      .selectAll()
      .where("userId", "=", user.id)
      .executeTakeFirst();

    if (!subscription) {
      return new Response(JSON.stringify({ error: "No active subscription found." }), { status: 400 });
    }

    if (subscription.plan === "beta") {
      return new Response(JSON.stringify({ error: "Beta subscriptions cannot be cancelled." }), { status: 400 });
    }

    // Cancel on Stripe first if a Stripe subscription exists
    if (subscription.stripeSubscriptionId) {
      console.log(`Cancelling Stripe subscription ${subscription.stripeSubscriptionId} for user ${user.id}`);
      await cancelStripeSubscription(subscription.stripeSubscriptionId);
      console.log(`Stripe subscription ${subscription.stripeSubscriptionId} cancelled successfully`);
    }

    const now = new Date();

    const updatedSubscription = await db
      .updateTable("subscriptions")
      .set({
        status: "cancelled",
        cancelledAt: now,
        cancelReason: reason ?? null,
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