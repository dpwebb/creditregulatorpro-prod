import { db } from "../../helpers/db";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { schema, OutputType } from "./update_POST.schema";

function hasReleaseNotes(value: unknown): value is Array<{ category: string; items: string[] }> {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => entry && typeof entry === "object")
  );
}

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") throw new BusinessRuleError("Admin only endpoint", 403);
    
    const json = JSON.parse(await request.text());
    const input = schema.parse(json);
    
    return await db.transaction().execute(async (trx) => {
      const version = await trx.selectFrom('softwareVersion')
        .selectAll()
        .where('id', '=', input.id)
        .executeTakeFirstOrThrow();
        
      if (version.locked && input.locked !== false) {
         throw new BusinessRuleError("Cannot modify a locked version unless unlocking it", 409);
      }
      
      const updateData: any = { updatedAt: new Date() };
      
      if (input.codename !== undefined) updateData.codename = input.codename;
      if (input.releaseNotes !== undefined) updateData.releaseNotes = input.releaseNotes;
      if (input.locked !== undefined) updateData.locked = input.locked;
      
      if (input.status && input.status !== version.status) {
        const allowed: Record<string, string[]> = {
          draft: ['staged'],
          staged: ['draft', 'released'],
          released: ['archived'],
          archived: []
        };
        
        if (!allowed[version.status].includes(input.status)) {
          throw new BusinessRuleError(`Invalid status transition from ${version.status} to ${input.status}`, 400);
        }

        const finalReleaseNotes = input.releaseNotes !== undefined ? input.releaseNotes : version.releaseNotes;
        const versionHasReleaseNotes = hasReleaseNotes(finalReleaseNotes);
        const versionHasSnapshot = !!version.systemSnapshot;

        if (input.status === 'staged') {
           if (!versionHasReleaseNotes) throw new BusinessRuleError("Cannot stage without release notes", 400);
           if (!versionHasSnapshot) throw new BusinessRuleError("Cannot stage without a system snapshot", 400);
        }

        if (input.status === 'released') {
           if (!versionHasReleaseNotes) throw new BusinessRuleError("Cannot release without release notes", 400);
           if (!versionHasSnapshot) throw new BusinessRuleError("Cannot release without a system snapshot", 400);
           
           // Archive any currently released version
           await trx.updateTable('softwareVersion')
              .set({ status: 'archived', updatedAt: new Date() })
              .where('status', '=', 'released')
              .execute();
              
           updateData.status = 'released';
           updateData.releasedAt = new Date();
        } else {
           updateData.status = input.status;
        }
      }
      
      const updated = await trx.updateTable('softwareVersion')
         .set(updateData)
         .where('id', '=', input.id)
         .returningAll()
         .executeTakeFirstOrThrow();
         
      return new Response(JSON.stringify(updated satisfies OutputType));
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
