import { db } from "./db";
import { Selectable } from "kysely";
import { ParserFieldMapping, ParserBureauDetectionConfig } from "./schema";
import { LLMResponse } from "./docstrangeLLM";

function isMissingOptionalParserTableError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "42P01"
  );
}

/**
 * Loads all active dynamic field overrides for a specific bureau from the database.
 * Mappings are applied in descending priority order.
 */
export async function loadActiveMappings(bureau: string): Promise<Selectable<ParserFieldMapping>[]> {
  try {
    return await db
      .selectFrom("parserFieldMapping")
      .selectAll()
      .where("bureau", "=", bureau)
      .where("isActive", "=", true)
      .orderBy("priority", "desc")
      .execute();
  } catch (error) {
    if (isMissingOptionalParserTableError(error)) {
      console.warn("[Parser Engine] parser_field_mapping table is unavailable. Continuing with built-in parser mappings.");
      return [];
    }

    throw error;
  }
}

/**
 * Loads active bureau detection markers to augment or replace the hardcoded scoring system.
 */
export async function loadBureauDetectionConfig(): Promise<Selectable<ParserBureauDetectionConfig>[]> {
  try {
    return await db
      .selectFrom("parserBureauDetectionConfig")
      .selectAll()
      .where("isActive", "=", true)
      .orderBy("weight", "desc")
      .execute();
  } catch (error) {
    if (isMissingOptionalParserTableError(error)) {
      console.warn("[Parser Engine] parser_bureau_detection_config table is unavailable. Continuing with built-in bureau detection.");
      return [];
    }

    throw error;
  }
}

/**
 * Safely extracts a nested value from an object using a dot-notation path.
 * Supports array indices, e.g. "addresses[0].city"
 */
export function getNestedValue(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    const match = part.match(/^([^\[]+)\[(\d+)\]$/);
    if (match) {
        current = current[match[1]];
        if (current !== null && current !== undefined) {
            current = current[parseInt(match[2], 10)];
        }
    } else {
        current = current[part];
    }
  }
  return current;
}

/**
 * Safely sets a nested value in an object using a dot-notation path.
 * Auto-initializes intermediate objects or arrays if they do not exist.
 */
export function setNestedValue(obj: any, path: string, value: any): void {
  if (!obj || !path) return;
  const parts = path.split('.');
  let current = obj;
  
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const match = part.match(/^([^\[]+)\[(\d+)\]$/);
    if (match) {
        const prop = match[1];
        const index = parseInt(match[2], 10);
        if (!current[prop]) current[prop] = [];
        if (!current[prop][index]) current[prop][index] = {};
        current = current[prop][index];
    } else {
        if (!current[part]) current[part] = {};
        current = current[part];
    }
  }
  
  const lastPart = parts[parts.length - 1];
  const lastMatch = lastPart.match(/^([^\[]+)\[(\d+)\]$/);
  if (lastMatch) {
      const prop = lastMatch[1];
      const index = parseInt(lastMatch[2], 10);
      if (!current[prop]) current[prop] = [];
      current[prop][index] = value;
  } else {
      current[lastPart] = value;
  }
}

/**
 * Executes a defined data transformation logic over a single value.
 */
export function executeTransform(value: any, transformType: string, config: any): any {
  if (value === null || value === undefined) {
      if (transformType === "fallback_chain") return null;
      return value;
  }
  
  switch(transformType) {
    case "direct":
        return value;
    case "date_parse":
        // Treat as a string passthrough, docstrangeParser's dateUtils handles standardized validation down the line
        return String(value).trim();
    case "numeric":
        if (typeof value === "number") return value;
        const numStr = String(value).replace(/[^0-9.-]/g, "");
        const num = parseFloat(numStr);
        return isNaN(num) ? undefined : num;
    case "regex_extract":
        if (!config?.pattern) return value;
        try {
            const regex = new RegExp(config.pattern);
            const match = String(value).match(regex);
            if (match) {
                const group = config.captureGroup || 0;
                return match[group];
            }
        } catch(e) {
            console.error("[Parser Engine] Invalid regex pattern configuration:", config.pattern);
        }
        return null;
    case "uppercase":
        return String(value).toUpperCase();
    case "lowercase":
        return String(value).toLowerCase();
    case "boolean":
        if (typeof value === "string") {
            const lower = value.trim().toLowerCase();
            return lower === "true" || lower === "yes" || lower === "1" || lower === "y";
        }
        return Boolean(value);
    case "fallback_chain":
        if (!config?.fields || !Array.isArray(config.fields)) return null;
        for (const field of config.fields) {
            const val = getNestedValue(value, field);
            if (val !== null && val !== undefined && val !== "") return val;
        }
        return null;
    default:
        return value;
  }
}

/**
 * The core engine function. Mutates a deep copy of the raw LLMResponse by applying
 * an ordered list of dynamic mappings prior to standard model assimilation.
 */
export function applyOverrides(llmData: LLMResponse, mappings: Selectable<ParserFieldMapping>[]): LLMResponse {
  // Deep clone to prevent mutating underlying memory if passed by reference
  const data = JSON.parse(JSON.stringify(llmData)) as LLMResponse;

  for (const mapping of mappings) {
    const transformType = mapping.transformType;
    const config = (mapping.transformConfig as any) || {};
    const sourcePath = mapping.sourcePath;
    const targetField = mapping.targetField;
    const section = mapping.section;

    const processItem = (item: any) => {
      let val;
      if (transformType === "fallback_chain") {
        // Fallback chain uses the parent object itself to sequentially test multiple keys
        val = executeTransform(item, transformType, config);
      } else {
        val = getNestedValue(item, sourcePath);
        val = executeTransform(val, transformType, config);
      }
      
      if (val !== undefined) {
        setNestedValue(item, targetField, val);
      }
    };

    switch(section) {
      case "tradeline":
        if (Array.isArray(data.tradelines)) {
            data.tradelines.forEach(processItem);
        }
        break;
      case "inquiry":
        if (Array.isArray(data.inquiries)) data.inquiries.forEach(processItem);
        if (Array.isArray(data.creditRelatedInquiries)) data.creditRelatedInquiries.forEach(processItem);
        if (Array.isArray(data.nonCreditRelatedInquiries)) data.nonCreditRelatedInquiries.forEach(processItem);
        if (Array.isArray(data.accountReviewInquiries)) data.accountReviewInquiries.forEach(processItem);
        break;
      case "public_record":
        if (Array.isArray(data.publicRecords)) data.publicRecords.forEach(processItem);
        if (Array.isArray(data.insolvency)) data.insolvency.forEach(processItem);
        break;
      case "employment":
        if (Array.isArray(data.employments)) data.employments.forEach(processItem);
        break;
      case "consumer_info":
      case "metadata":
      default:
        // Metadata and root-level consumer info operations target the parent LLMResponse envelope
        processItem(data);
        break;
    }
  }

  return data;
}
