import { schema, OutputType } from "./update_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { calculateExpectedRemovalDate, calculateRetentionPeriod } from "../../helpers/bankruptcyRules";
import { AuditActionType, AuditEntityType } from "../../helpers/schema";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    // Fetch existing record to verify ownership and get current values for calculation
    const existingRecord = await db
      .selectFrom('bankruptcyRecord')
      .selectAll()
      .where('id', '=', input.id)
      .where('userId', '=', user.id)
      .executeTakeFirst();

    if (!existingRecord) {
      return new Response(JSON.stringify({ error: "Record not found or access denied" }), { status: 404 });
    }

    // Merge input with existing data for calculation
    const mergedData = {
      bankruptcyType: input.bankruptcyType ?? existingRecord.bankruptcyType,
      province: input.province ?? existingRecord.province,
      filingDate: input.filingDate ?? existingRecord.filingDate,
      dischargeDate: input.dischargeDate !== undefined ? input.dischargeDate : existingRecord.dischargeDate,
      completionDate: input.completionDate !== undefined ? input.completionDate : existingRecord.completionDate,
    };

    // Recalculate rules if relevant fields changed
    const retentionInfo = calculateRetentionPeriod(
      mergedData.bankruptcyType,
      mergedData.province,
      true
    );

    const expectedRemovalDate = calculateExpectedRemovalDate(
      mergedData.filingDate,
      mergedData.dischargeDate,
      mergedData.completionDate,
      mergedData.bankruptcyType,
      mergedData.province,
      true
    );

    const finalExpectedRemovalDate = expectedRemovalDate ?? new Date('9999-12-31');

    const result = await db.transaction().execute(async (trx) => {
      const updatedRecord = await trx
        .updateTable('bankruptcyRecord')
        .set({
          ...input,
          retentionYears: retentionInfo.years,
          retentionMonths: retentionInfo.months,
          retentionRuleDescription: retentionInfo.description,
          expectedRemovalDate: finalExpectedRemovalDate,
          updatedAt: new Date(),
        })
        .where('id', '=', input.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      // Audit Log
      await trx
        .insertInto('auditLog')
        .values({
          userId: user.id,
          actionType: 'UPDATE' as AuditActionType,
          entityType: 'BANKRUPTCY_RECORD' as any as AuditEntityType,
          entityId: updatedRecord.id,
                    details: {
            changes: input,
            newRemovalDate: finalExpectedRemovalDate
          } as any,
          ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
          status: 'SUCCESS',
          region: 'CA'
        })
        .execute();

      return updatedRecord;
    });

    return new Response(JSON.stringify({ record: result } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}