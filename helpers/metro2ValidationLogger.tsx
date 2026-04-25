import { db } from "./db";
import { ValidationSeverity } from "./schema";

export type LogValidationParams = {
  tradelineId?: number;
  ruleName: string;
  category: string;
  severity: ValidationSeverity;
  expectedValue?: string;
  actualValue?: string;
  message: string;
  region: string;
  metro2Version?: string;
};

export type GetValidationLogsFilters = {
  tradelineId?: number;
  severity?: ValidationSeverity;
  category?: string;
};

/**
 * Logs a validation failure or warning to the metro2_validation_log table.
 * This is typically called during the ingestion or re-validation process.
 * 
 * Uses an upsert pattern: if a log with the same tradelineId, ruleName, and message
 * already exists, updates the validatedAt timestamp. Otherwise, inserts a new record.
 * This prevents duplicate validation entries in the UI.
 */
export async function logValidation(params: LogValidationParams) {
  try {
    // Check if a validation log with the same key fields already exists
    let query = db
      .selectFrom("metro2ValidationLog")
      .select("id")
      .where("ruleName", "=", params.ruleName)
      .where("message", "=", params.message);

    // Handle tradelineId which can be null
    if (params.tradelineId !== undefined) {
      query = query.where("tradelineId", "=", params.tradelineId);
    } else {
      query = query.where("tradelineId", "is", null);
    }

    const existing = await query.executeTakeFirst();

    if (existing) {
      // Update the existing record's timestamp and other fields that may have changed
      await db
        .updateTable("metro2ValidationLog")
        .set({
          validatedAt: new Date(),
          severity: params.severity,
          expectedValue: params.expectedValue ?? null,
          actualValue: params.actualValue ?? null,
          ruleCategory: params.category,
          region: params.region,
          metro2Version: params.metro2Version ?? null,
        })
        .where("id", "=", existing.id)
        .execute();
      
      console.log(`Updated existing validation log (id: ${existing.id}) for rule: ${params.ruleName}`);
    } else {
      // Insert a new record
      await db
        .insertInto("metro2ValidationLog")
        .values({
          tradelineId: params.tradelineId ?? null,
          ruleName: params.ruleName,
          ruleCategory: params.category,
          severity: params.severity,
          expectedValue: params.expectedValue ?? null,
          actualValue: params.actualValue ?? null,
          message: params.message,
          region: params.region,
          metro2Version: params.metro2Version ?? null,
          validatedAt: new Date(),
        })
        .execute();
      
      console.log(`Inserted new validation log for rule: ${params.ruleName}`);
    }
  } catch (error) {
    console.error("Failed to log metro2 validation:", error);
    // We don't throw here to prevent blocking the main process if logging fails
  }
}

/**
 * Retrieves validation logs based on filters.
 * Useful for displaying validation issues in the UI.
 */
export async function getValidationLogs(filters: GetValidationLogsFilters) {
  let query = db.selectFrom("metro2ValidationLog").selectAll();

  if (filters.tradelineId !== undefined) {
    query = query.where("tradelineId", "=", filters.tradelineId);
  }
  if (filters.severity) {
    query = query.where("severity", "=", filters.severity);
  }
  if (filters.category) {
    query = query.where("ruleCategory", "=", filters.category);
  }

  return await query.orderBy("validatedAt", "desc").execute();
}