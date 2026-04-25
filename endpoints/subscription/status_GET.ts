import { OutputType } from "./status_GET.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { getSubscriptionDefaults } from "../../helpers/getSubscriptionDefaults";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    if (user.role === "admin") {
      // Admin users don't have subscriptions; return a non-200 so the frontend query is skipped.
      // The frontend guards against calling this for admins, but this is a safe fallback.
      return new Response(JSON.stringify({ error: "Admin users do not have subscriptions" }), {
        status: 403,
      });
    }

    let subscription = await db
      .selectFrom("subscriptions")
      .selectAll()
      .where("userId", "=", user.id)
      .executeTakeFirst();

    if (!subscription) {
      const now = new Date();
      const subscriptionDefaults = await getSubscriptionDefaults(now);

      subscription = await db
        .insertInto("subscriptions")
        .values({
          userId: user.id,
          ...subscriptionDefaults,
          updatedAt: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    }

    return new Response(
      JSON.stringify(subscription satisfies OutputType)
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}