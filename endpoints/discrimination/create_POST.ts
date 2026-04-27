import { schema, OutputType } from "./create_POST.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";

export async function handle(request: Request) {
  try {
    const session = await getServerUserSession(request);
    const isAdmin = session.user.role === "admin";

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    // For regular users, verify they own the tradeline
    if (!isAdmin) {
      const tradeline = await db
        .selectFrom("tradeline")
        .select("id")
        .where("id", "=", input.tradelineId)
        .where("userId", "=", session.user.id)
        .executeTakeFirst();

      if (!tradeline) {
        return new Response(
          JSON.stringify({ error: "Tradeline not found or access denied" }),
          { status: 404 }
        );
      }
    } else {
      // For admins, just verify the tradeline exists
      const tradeline = await db
        .selectFrom("tradeline")
        .select("id")
        .where("id", "=", input.tradelineId)
        .executeTakeFirst();

      if (!tradeline) {
        return new Response(
          JSON.stringify({ error: "Tradeline not found" }),
          { status: 404 }
        );
      }
    }

    // Create the discrimination claim
    const result = await db
      .insertInto("discriminationClaim")
      .values({
        tradelineId: input.tradelineId,
        obligationInstanceId: input.obligationInstanceId ?? null,
        packetId: input.packetId ?? null,
        grounds: input.grounds,
        description: input.description ?? null,
        evidenceSummary: input.evidenceSummary ?? null,
        allegedDiscriminationDate: input.allegedDiscriminationDate ?? null,
        region: "CA", // Policy: Canada only
        status: "REPORTED",
        reportedDate: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    console.log(
      `Discrimination claim created: id=${result.id}, tradelineId=${input.tradelineId}, userId=${session.user.id}, isAdmin=${isAdmin}`
    );

    return new Response(JSON.stringify(result satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}