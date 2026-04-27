import { Selectable } from "kysely";
import { db } from "./db";
import { Tradeline } from "./schema";
import { DetectedViolation } from "./complianceDetectors";
import { ValidationSeverity } from "./schema";
import { RuleDefinitionSchema } from "./dynamicRuleGenerator";

function evaluateCondition(
  tradelineValue: any,
  operator: string,
  conditionValue: any
): boolean {
  switch (operator) {
    case "equals":
      return String(tradelineValue).toLowerCase() === String(conditionValue).toLowerCase();
    case "notEquals":
      return String(tradelineValue).toLowerCase() !== String(conditionValue).toLowerCase();
    case "contains":
      return String(tradelineValue).toLowerCase().includes(String(conditionValue).toLowerCase());
    case "greaterThan":
      return Number(tradelineValue) > Number(conditionValue);
    case "lessThan":
      return Number(tradelineValue) < Number(conditionValue);
    case "isNull":
      return tradelineValue === null || tradelineValue === undefined;
    case "isNotNull":
      return tradelineValue !== null && tradelineValue !== undefined;
    case "olderThanDays": {
      if (!tradelineValue) return false;
      const date = new Date(tradelineValue).getTime();
      if (isNaN(date)) return false;
      const diffDays = (Date.now() - date) / (1000 * 60 * 60 * 24);
      return diffDays > Number(conditionValue);
    }
    case "newerThanDays": {
      if (!tradelineValue) return false;
      const date = new Date(tradelineValue).getTime();
      if (isNaN(date)) return false;
      const diffDays = (Date.now() - date) / (1000 * 60 * 60 * 24);
      return diffDays < Number(conditionValue);
    }
    case "matchesPattern": {
      if (!tradelineValue || !conditionValue) return false;
      try {
        const regex = new RegExp(String(conditionValue), "i");
        return regex.test(String(tradelineValue));
      } catch (e) {
        console.error("Invalid regex in dynamic rule:", conditionValue);
        return false;
      }
    }
    default:
      return false;
  }
}

function processTemplate(template: string, tradeline: Selectable<Tradeline>, matchedField: string, matchedValue: any): string {
  const dict: Record<string, string> = {
    "{creditorName}": tradeline.originalCreditorName || tradeline.collectionAgencyName || "Unknown Creditor",
    "{accountNumber}": tradeline.accountNumber || "Unknown Account",
    "{field}": matchedField,
    "{value}": matchedValue !== null && matchedValue !== undefined ? String(matchedValue) : "null",
  };

  let output = template;
  for (const [key, val] of Object.entries(dict)) {
    output = output.split(key).join(val);
  }
  return output;
}

/**
 * Loads all active dynamic scanning rules from the database and executes them against a single tradeline.
 * Produces DetectedViolations for any rules that match.
 */
export async function executeActiveRules(
  tradeline: Selectable<Tradeline>
): Promise<DetectedViolation[]> {
  const activeRules = await db
    .selectFrom("dynamicScanningRule")
    .selectAll()
    .where("status", "=", "ACTIVE")
    .execute();

  const violations: DetectedViolation[] = [];

  for (const rule of activeRules) {
    if (!rule.ruleDefinition) continue;

    const parsedDef = RuleDefinitionSchema.safeParse(rule.ruleDefinition);
    if (!parsedDef.success) {
      console.warn(`[Dynamic Rule Executor] Active rule ${rule.id} has invalid definition structure.`);
      continue;
    }

    const { conditions, logic } = parsedDef.data;
    
    let isMatch = false;
    let primaryMatchedField = "";
    let primaryMatchedValue = null;

    if (logic === "AND") {
      isMatch = true;
      for (const cond of conditions) {
        const tlValue = tradeline[cond.field as keyof Selectable<Tradeline>];
        const condMatch = evaluateCondition(tlValue, cond.operator, cond.value);
        if (!condMatch) {
          isMatch = false;
          break;
        } else if (!primaryMatchedField) {
          primaryMatchedField = cond.field;
          primaryMatchedValue = tlValue;
        }
      }
    } else if (logic === "OR") {
      isMatch = false;
      for (const cond of conditions) {
        const tlValue = tradeline[cond.field as keyof Selectable<Tradeline>];
        const condMatch = evaluateCondition(tlValue, cond.operator, cond.value);
        if (condMatch) {
          isMatch = true;
          primaryMatchedField = cond.field;
          primaryMatchedValue = tlValue;
          break;
        }
      }
    }

    if (isMatch) {
      violations.push({
        violationCategory: rule.violationCategory as any,
        severity: rule.severity as ValidationSeverity,
        confidenceScore: parseFloat(String(rule.confidenceScore)) || 0.8,
        userExplanation: processTemplate(rule.userExplanationTemplate, tradeline, primaryMatchedField, primaryMatchedValue),
        recommendedAction: processTemplate(rule.recommendedActionTemplate, tradeline, primaryMatchedField, primaryMatchedValue),
        technicalDetails: {
          ruleId: rule.id,
          ruleTitle: rule.title,
          fieldName: primaryMatchedField,
          matchedValue: primaryMatchedValue,
          statutoryBasis: rule.statutoryBasis,
        },
      });
    }
  }

  return violations;
}