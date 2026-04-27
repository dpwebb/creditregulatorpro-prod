import { db } from "../../helpers/db";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { schema, OutputType } from "./create_POST.schema";
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

    const mapping = await db.transaction().execute(async (trx) => {
      // 1. Insert the new dynamic mapping
      const inserted = await trx
        .insertInto("parserFieldMapping")
        .values({
          bureau: input.bureau,
          sourcePath: input.sourcePath,
          targetField: input.targetField,
          section: input.section,
          transformType: input.transformType,
          transformConfig: input.transformConfig || null,
          isActive: input.isActive ?? true,
          priority: input.priority ?? 0,
          description: input.description || null,
          createdBy: user.id,
          updatedAt: new Date(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // 2. Log creation in the version control table
      await trx
        .insertInto("parserMappingVersion")
        .values({
          mappingId: inserted.id,
          changeType: "created",
          versionNumber: 1,
          newState: JSON.parse(JSON.stringify(inserted)) as any,
          previousState: null,
          changedBy: user.id,
          notes: "Initial creation",
        })
        .execute();

      return inserted;
    });

    return new Response(superjson.stringify({ mapping } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}