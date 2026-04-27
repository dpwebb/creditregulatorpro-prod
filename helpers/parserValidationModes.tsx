import { z } from "zod";

// --- Constants ---

export const CANADIAN_POSTAL_CODE_PATTERN = "^[A-Za-z]\\d[A-Za-z][ -]?\\d[A-Za-z]\\d$";

export const CANADIAN_PROVINCES = [
  "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"
] as const;

// --- Types ---

export type ValidationMode = 'exact' | 'presence' | 'format' | 'numeric' | 'skip';

export interface FieldExpectation {
  mode: ValidationMode;
  value?: any; // For 'exact' mode
  pattern?: string; // For 'format' mode
  minLength?: number; // For 'presence' or 'format'
  min?: number; // For 'numeric'
  max?: number; // For 'numeric'
  allowedValues?: string[]; // For 'exact' (if we want to allow a set of values, though simple exact is usually 1 value)
  addToKnownEntities?: boolean; // Metadata for the UI/Backend to know if this should be saved to dictionary
}

export type ConsumerInfoExpectations = {
  fullName?: FieldExpectation;
  addressLine1?: FieldExpectation;
  addressLine2?: FieldExpectation;
  city?: FieldExpectation;
  province?: FieldExpectation;
  postalCode?: FieldExpectation;
  dateOfBirth?: FieldExpectation;
};

export type TradelineFieldExpectations = {
  accountNumber?: FieldExpectation;
  creditorName?: FieldExpectation;
  accountType?: FieldExpectation;
  balance?: FieldExpectation;
  status?: FieldExpectation;
  openedDate?: FieldExpectation;
  highCredit?: FieldExpectation;
  pastDue?: FieldExpectation;
  [key: string]: FieldExpectation | undefined;
};

// --- Logic ---

/**
 * Returns smart default validation modes based on the field name.
 */
export function getDefaultModeForField(fieldName: string): ValidationMode {
  // Normalize field name for checking
  const lowerName = fieldName.toLowerCase();

  if (['province', 'state'].some(k => lowerName.includes(k))) {
    return 'exact';
  }

  if (['postalcode', 'zip'].some(k => lowerName.includes(k))) {
    return 'format';
  }

  if (['creditorname', 'status', 'accounttype', 'bureau'].some(k => lowerName.includes(k))) {
    return 'exact';
  }

  if (['balance', 'highcredit', 'pastdue', 'amount', 'limit'].some(k => lowerName.includes(k))) {
    return 'numeric';
  }

  if (['fullname', 'addressline1', 'addressline2', 'city', 'accountnumber'].some(k => lowerName.includes(k))) {
    return 'presence';
  }

  // Default fallback
  return 'presence';
}

/**
 * Returns a default pattern if one exists for the field (e.g. postal code).
 */
export function getDefaultPatternForField(fieldName: string): string | undefined {
  const lowerName = fieldName.toLowerCase();
  if (lowerName.includes('postalcode')) {
    return CANADIAN_POSTAL_CODE_PATTERN;
  }
  return undefined;
}

/**
 * Validates a value against a field expectation.
 */
export function validateFieldValue(value: any, expectation: FieldExpectation): { passed: boolean; message?: string } {
  const { mode } = expectation;

  // Handle null/undefined values first
  if (value === null || value === undefined || value === '') {
    if (mode === 'skip') {
      return { passed: true };
    }
    // For all other modes, if we expect something but got nothing, it's usually a failure
    // unless we are in a mode that explicitly allows empty (which usually isn't the case for 'presence')
    // However, 'exact' might expect null.
    if (mode === 'exact' && (expectation.value === null || expectation.value === undefined || expectation.value === '')) {
      return { passed: true };
    }
    return { passed: false, message: 'Value is missing or empty' };
  }

  switch (mode) {
    case 'skip':
      return { passed: true };

    case 'exact':
      // Simple equality check. For objects/dates, might need deeper comparison but usually these are primitives.
      // If value is a Date object, compare ISO strings or timestamps
      if (value instanceof Date && expectation.value instanceof Date) {
        if (value.getTime() === expectation.value.getTime()) return { passed: true };
        return { 
          passed: false, 
          message: `Expected date ${expectation.value.toISOString()}, got ${value.toISOString()}` 
        };
      }
      
      // Loose equality for numbers/strings to handle "100" vs 100 if needed, but strict is safer
      if (value === expectation.value) {
        return { passed: true };
      }
      return { 
        passed: false, 
        message: `Expected "${expectation.value}", got "${value}"` 
      };

    case 'presence':
      // We already checked for null/undefined/empty string above.
      // Check minLength if string
      if (typeof value === 'string' && expectation.minLength !== undefined) {
        if (value.length < expectation.minLength) {
          return { passed: false, message: `Length ${value.length} is less than minimum ${expectation.minLength}` };
        }
      }
      return { passed: true };

    case 'format':
      if (typeof value !== 'string') {
        return { passed: false, message: 'Value is not a string, cannot match pattern' };
      }
      if (expectation.pattern) {
        try {
          const regex = new RegExp(expectation.pattern);
          if (!regex.test(value)) {
            return { passed: false, message: `Value "${value}" does not match pattern /${expectation.pattern}/` };
          }
        } catch (e) {
          return { passed: false, message: `Invalid regex pattern: ${expectation.pattern}` };
        }
      }
      return { passed: true };

    case 'numeric':
      const num = Number(value);
      if (isNaN(num)) {
        return { passed: false, message: `Value "${value}" is not a valid number` };
      }
      if (expectation.min !== undefined && num < expectation.min) {
        return { passed: false, message: `Value ${num} is less than minimum ${expectation.min}` };
      }
      if (expectation.max !== undefined && num > expectation.max) {
        return { passed: false, message: `Value ${num} is greater than maximum ${expectation.max}` };
      }
      return { passed: true };

    default:
      return { passed: false, message: `Unknown validation mode: ${mode}` };
  }
}