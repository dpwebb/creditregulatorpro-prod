import { db } from "../../helpers/db";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { schema, OutputType } from "./rollback_POST.schema";
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

    const version = await db
      .selectFrom("parserMappingVersion")
      .selectAll()
      .where("id", "=", input.versionId)
      .executeTakeFirst();

    if (!version) {
      throw new BusinessRuleError("Version not found", 404);
    }

    if (!version.previousState) {
      throw new BusinessRuleError("No previous state available for rollback on this version layer", 400);
    }

    const prevState = version.previousState as any;
    
    const mapping = await db.transaction().execute(async (trx) => {
      // Assure mapping still exists conceptually before trying an update
      const current = await trx
        .selectFrom("parserFieldMapping")
        .selectAll()
        .where("id", "=", version.mappingId)
        .executeTakeFirst();
        
      if (!current) {
        throw new BusinessRuleError("Mapping target no longer exists; cannot rollback deleted mappings natively currently.", 400);
      }

      // Rollback values to historical snapshot context
      const updated = await trx
        .updateTable("parserFieldMapping")
        .set({
          sourcePath: prevState.sourcePath,
          targetField: prevState.targetField,
          section: prevState.section,
          transformType: prevState.transformType,
          transformConfig: prevState.transformConfig,
          isActive: prevState.isActive,
          priority: prevState.priority,
          description: prevState.description,
          updatedAt: new Date(),
        })
        .where("id", "=", version.mappingId)
        .returningAll()
        .executeTakeFirstOrThrow();

      // Log the rollback explicit sequence operation
      const lastVersion = await trx
        .selectFrom("parserMappingVersion")
        .select("versionNumber")
        .where("mappingId", "=", version.mappingId)
        .orderBy("versionNumber", "desc")
        .limit(1)
        .executeTakeFirst();
      const nextVersion = lastVersion ? lastVersion.versionNumber + 1 : 1;

      await trx
        .insertInto("parserMappingVersion")
        .values({
          mappingId: version.mappingId,
          changeType: "rollback",
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