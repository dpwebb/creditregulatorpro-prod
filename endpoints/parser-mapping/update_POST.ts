import { db } from "../../helpers/db";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { schema, OutputType } from "./update_POST.schema";
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

    const mapping = await db.transaction().execute(async (trx) => {
      // Determine explicit state transitions for richer audit logging
      let changeType = "updated";
      if (input.isActive !== undefined && input.isActive !== current.isActive) {
        changeType = input.isActive ? "activated" : "deactivated";
      }

      // Update mapping definition
      const updated = await trx
        .updateTable("parserFieldMapping")
        .set({
          sourcePath: input.sourcePath ?? current.sourcePath,
          targetField: input.targetField ?? current.targetField,
          section: input.section ?? current.section,
          transformType: input.transformType ?? current.transformType,
          transformConfig: input.transformConfig !== undefined ? input.transformConfig : current.transformConfig,
          isActive: input.isActive ?? current.isActive,
          priority: input.priority ?? current.priority,
          description: input.description !== undefined ? input.description : current.description,
          updatedAt: new Date(),
        })
        .where("id", "=", input.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      // Calculate incremental version safely
      const lastVersion = await trx
        .selectFrom("parserMappingVersion")
        .select("versionNumber")
        .where("mappingId", "=", input.id)
        .orderBy("versionNumber", "desc")
        .limit(1)
        .executeTakeFirst();
      const nextVersion = lastVersion ? lastVersion.versionNumber + 1 : 1;

      // Persist diff envelope
      await trx
        .insertInto("parserMappingVersion")
        .values({
          mappingId: input.id,
          changeType,
          versionNumber: nextVersion,
          newState: JSON.parse(JSON.stringify(updated)) as any,
          previousState: JSON.parse(JSON.stringify(current)) as any,
          changedBy: user.id,
        })
        .execute();

      return updated;
    });

    return new Response(superjson.stringify({ mapping } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}