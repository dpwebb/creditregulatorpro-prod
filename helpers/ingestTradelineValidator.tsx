import { ParsedTradeline } from "./reportParser";
import { validateTradeline, TL } from "./metro2";
import { getRulesByYear } from "./metro2ValidationRules";
import { logValidation } from "./metro2ValidationLogger";

export interface ValidateTradelinesInput {
  parsedTradelines: ParsedTradeline[];
  tradelineIds: number[];
  region: string;
  reportDate?: Date | null;
}

export interface ValidateTradelinesResult {
  validationRulesApplied: string[];
  validationCount: number;
}

/**
 * Validates tradelines against Metro2 rules and logs validation results.
 * 
 * @param input - Parsed tradelines with their database IDs
 * @returns Validation results including rules applied and validation count
 */
export async function validateTradelines(
  input: ValidateTradelinesInput
): Promise<ValidateTradelinesResult> {
  const { parsedTradelines, tradelineIds, region, reportDate } = input;
  
  if (parsedTradelines.length === 0) {
    return {
      validationRulesApplied: [],
      validationCount: 0,
    };
  }

  // Get validation rules for the current year. getRulesByYear falls back to the
  // latest supported ruleset for future years.
  const crrgYear = new Date().getFullYear();
  const ruleSet = getRulesByYear(crrgYear);
  const validationRulesApplied = ruleSet.rules.map(rule => rule.ruleName);
  
  let validationCount = 0;

  // Validate each tradeline
  for (let i = 0; i < parsedTradelines.length; i++) {
    const parsedTradeline = parsedTradelines[i];
    const tradelineId = tradelineIds[i] ?? undefined;
    
    const tl: TL = {
      amounts: {
        high: parsedTradeline.amounts.high ?? 0,
        current: parsedTradeline.balance,
        pastDue: parsedTradeline.amounts.pastDue ?? 0,
      },
      dates: {
        opened: parsedTradeline.dates.opened ?? null,
        reported: parsedTradeline.dates.reported ?? null,
        closed: parsedTradeline.dates.closed ?? null,
        dofd: parsedTradeline.dates.dofd ?? null,
        chargeOff: null,
      },
      status: parsedTradeline.status,
      remarkCodes: parsedTradeline.remarkCodes,
      payment: { scheduledMonthly: 0 },
      creditorName: parsedTradeline.creditorName,
      creditLimit: parsedTradeline.creditLimit,
      accountType: parsedTradeline.accountType,
      paymentPattern: parsedTradeline.paymentPattern,
      isCollectionAccount: parsedTradeline.isCollectionAccount ?? false,
      lastPaymentDate: parsedTradeline.lastPaymentDate ?? null,
      reportDate: reportDate ?? null,
    };
    
    const validationResults = validateTradeline(tl, String(crrgYear));
    
    for (const result of validationResults) {
      if (!result.valid) {
        await logValidation({
          tradelineId: tradelineId,
          ruleName: result.ruleName,
          category: result.category,
          severity: result.severity as "ERROR" | "WARNING" | "INFO",
          expectedValue: result.expectedValue,
          actualValue: result.actualValue,
          message: result.message ?? "Validation failed",
          region: region,
        });
        validationCount++;
      }
    }
  }

  console.log(`[validateTradelines] Validated ${parsedTradelines.length} tradelines, found ${validationCount} violations`);

  return {
    validationRulesApplied,
    validationCount,
  };
}
