import { schema, OutputType } from "./update_POST.schema";

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
      // For regular users, verify ownership via tradeline join
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

    // Build update object with only provided fields
    const updateData: Partial<{
      grounds: typeof input.grounds;
      description: string | null;
      evidenceSummary: string | null;
      status: string;
      resolution: string | null;
      resolvedDate: Date;
    }> = {};

    if (input.grounds !== undefined) updateData.grounds = input.grounds;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.evidenceSummary !== undefined) updateData.evidenceSummary = input.evidenceSummary;
    if (input.status !== undefined) updateData.status = input.status;
    if (input.resolution !== undefined) updateData.resolution = input.resolution;
    if (input.resolvedDate !== undefined) updateData.resolvedDate = input.resolvedDate;

    if (Object.keys(updateData).length === 0) {
      // No updates requested, return current state
      const current = await db
        .selectFrom("discriminationClaim")
        .selectAll()
        .where("id", "=", input.id)
        .executeTakeFirstOrThrow();
      return new Response(JSON.stringify(current satisfies OutputType));
    }

    const result = await db
      .updateTable("discriminationClaim")
      .set(updateData)
      .where("id", "=", input.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    console.log(
      `Discrimination claim updated: id=${input.id}, userId=${session.user.id}, isAdmin=${isAdmin}`
    );

    return new Response(JSON.stringify(result satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}