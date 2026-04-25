import { schema, OutputType } from "./delete_POST.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";

export async function handle(request: Request) {
  try {
    const session = await getServerUserSession(request);
    const isAdmin = session.user.role === "admin";

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    if (!isAdmin) {
      // For regular users, verify ownership via tradeline join before deleting
      const existingClaim = await db
        .selectFrom("discriminationClaim")
        .innerJoin("tradeline", "discriminationClaim.tradelineId", "tradeline.id")
        .select(["discriminationClaim.id"])
        .where("discriminationClaim.id", "=", input.id)
        .where("tradeline.userId", "=", session.user.id)
        .executeTakeFirst();

      if (!existingClaim) {
        return new Response(
          JSON.stringify({ error: "Claim not found or access denied" }),
          { status: 404 }
        );
      }
    } else {
      // For admins, just verify the claim exists
      const existingClaim = await db
        .selectFrom("discriminationClaim")
        .select("id")
        .where("id", "=", input.id)
        .executeTakeFirst();

      if (!existingClaim) {
        return new Response(
          JSON.stringify({ error: "Claim not found" }),
          { status: 404 }
        );
      }
    }

    await db
      .deleteFrom("discriminationClaim")
      .where("id", "=", input.id)
      .execute();

    console.log(
      `Discrimination claim deleted: id=${input.id}, userId=${session.user.id}, isAdmin=${isAdmin}`
    );

    return new Response(JSON.stringify({ success: true } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}