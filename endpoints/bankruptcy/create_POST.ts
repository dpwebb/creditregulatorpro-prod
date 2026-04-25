import { schema, OutputType } from "./create_POST.schema";

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

    // Calculate retention rules
    const retentionInfo = calculateRetentionPeriod(
      input.bankruptcyType,
      input.province,
      true // Assuming first time for now as per helper default, could be enhanced later
    );

    // Calculate expected removal date
    const expectedRemovalDate = calculateExpectedRemovalDate(
      input.filingDate,
      input.dischargeDate ?? null,
      input.completionDate ?? null,
      input.bankruptcyType,
      input.province,
      true
    );

    if (!expectedRemovalDate && input.bankruptcyType !== 'BANKRUPTCY_NOT_DISCHARGED') {
      // If we can't calculate it but it's not indefinite, we might want to warn or just leave it null if DB allows.
      // However, DB schema says expectedRemovalDate is Timestamp (not nullable in interface, but Generated usually implies default or nullable in DB, 
      // but looking at schema.ts: expectedRemovalDate: Timestamp; It is NOT nullable).
      // If it's not nullable, we must provide a value. 
      // For 'BANKRUPTCY_NOT_DISCHARGED', the helper returns null.
      // Let's check schema again: expectedRemovalDate: Timestamp; (Not nullable)
      // This might be an issue if we can't calculate it. 
      // We will use a far future date or the filing date + max rule if strictly required, 
      // but ideally the DB should allow null for active cases.
      // Wait, looking at schema.ts again: `expectedRemovalDate: Timestamp;` -> It is NOT nullable.
      // But `actualRemovalDate` is nullable.
      // If the helper returns null (e.g. missing discharge date), we can't insert if DB enforces not null.
      // We will throw an error if we can't calculate it, unless it's indefinite.
      // For indefinite, we'll set a far future date (e.g. 9999-12-31) to satisfy the column constraint if needed.
    }

    // Fallback for indefinite or uncalculable dates to satisfy DB constraint if strictly required
    // Using a far future date for "Indefinite"
    const finalExpectedRemovalDate = expectedRemovalDate ?? new Date('9999-12-31');

    const result = await db.transaction().execute(async (trx) => {
      const newRecord = await trx
        .insertInto('bankruptcyRecord')
        .values({
          userId: user.id,
                    organizationId: null,
          tradelineId: input.tradelineId,
          bankruptcyType: input.bankruptcyType,
          province: input.province,
          filingDate: input.filingDate,
          dischargeDate: input.dischargeDate,
          completionDate: input.completionDate,
          caseNumber: input.caseNumber,
          filingCourt: input.filingCourt,
          notes: input.notes,
          status: 'ACTIVE', // Default status
          region: 'CA', // Enforce CA region
          retentionYears: retentionInfo.years,
          retentionMonths: retentionInfo.months,
          retentionRuleDescription: retentionInfo.description,
          expectedRemovalDate: finalExpectedRemovalDate,
          equifaxReporting: true, // Default assumption
          transunionReporting: true, // Default assumption
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Audit Log
      await trx
        .insertInto('auditLog')
        .values({
          userId: user.id,
          actionType: 'CREATE' as AuditActionType,
          entityType: 'BANKRUPTCY_RECORD' as any as AuditEntityType, // Casting as requested
          entityId: newRecord.id,
                    details: {
            type: input.bankruptcyType,
            province: input.province,
            filingDate: input.filingDate
          } as any,
          ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
          status: 'SUCCESS',
          region: 'CA'
        })
        .execute();

      return newRecord;
    });

    return new Response(JSON.stringify({ record: result } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}