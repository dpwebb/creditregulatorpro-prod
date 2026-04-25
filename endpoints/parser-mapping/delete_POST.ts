import { db } from "../../helpers/db";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { schema, OutputType } from "./delete_POST.schema";
import superjson from "superjson";
import { getServerUserSession } from "../../helpers/getServerUserSession";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      throw new BusinessRuleError("Unauthorized: Admin role required", 403);
    }

    const json = superjson.parse(await request.text());
    const input = schema.parse(json);

    const current = await db
      .selectFrom("parserFieldMapping")
      .selectAll()
      .where("id", "=", input.id)
      .executeTakeFirst();

    if (!current) {
      throw new BusinessRuleError("Mapping not found", 404);
    }

    await db.transaction().execute(async (trx) => {
      // Determine next version number before deleting the mapping
      const lastVersion = await trx
        .selectFrom("parserMappingVersion")
        .select("versionNumber")
        .where("mappingId", "=", input.id)
        .orderBy("versionNumber", "desc")
        .limit(1)
        .executeTakeFirst();
      const nextVersion = lastVersion ? lastVersion.versionNumber + 1 : 1;

      // Insert the audit version record FIRST while mappingId FK is still valid.
      // After the mapping is deleted, ON DELETE SET NULL will null out mappingId on this row,
      // but previousState jsonb retains the full snapshot for forensic audit purposes.
      await trx
        .insertInto("parserMappingVersion")
        .values({
          mappingId: input.id,
          changeType: "deleted",
          versionNumber: nextVersion,
          newState: null,
          previousState: JSON.parse(JSON.stringify(current)) as any,
          changedBy: user.id,
        })
        .execute();

      // Delete the mapping after the audit record is safely written
      await trx
        .deleteFrom("parserFieldMapping")
        .where("id", "=", input.id)
        .execute();
    });

    return new Response(superjson.stringify({ success: true } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}