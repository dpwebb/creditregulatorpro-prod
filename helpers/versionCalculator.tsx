/**
 * Backend helper for calculating software version increments.
 * 
 * Uses a semantic versioning level approach (MAJOR, MINOR, PATCH) mapped
 * against specific entity and action types.
 */

export type SemVerLevel = 'MAJOR' | 'MINOR' | 'PATCH';

export const TRACKED_ENTITY_TYPES = [
  'SYSTEM',
  'BUREAU',
  'STATUTE',
  'OBLIGATION',
  'ENFORCEMENT_MECHANISM',
  'REGULATORY_UPDATE',
  'FURNISHER',
  'FURNISHER_OBLIGATION',
  'FURNISHER_VALIDATION'
] as const;

export const OPERATION_LEVEL_MAP: Record<string, Record<string, SemVerLevel>> = {
  SYSTEM: {
    SCHEMA_CHANGE: 'MAJOR',
    FEATURE_REMOVED: 'MAJOR',
    FEATURE_ADDED: 'MINOR',
    SYSTEM_CHANGE: 'MINOR',
    BUG_FIX: 'PATCH',
    CONFIG_UPDATE: 'PATCH',
    SETTINGS_CHANGED: 'PATCH'
  },
  BUREAU: { CREATE: 'MINOR', DELETE: 'MAJOR', UPDATE: 'PATCH' },
  STATUTE: { CREATE: 'MINOR', UPDATE: 'PATCH', DELETE: 'PATCH' },
  OBLIGATION: { CREATE: 'MINOR', UPDATE: 'PATCH', DELETE: 'PATCH' },
  ENFORCEMENT_MECHANISM: { CREATE: 'MINOR', UPDATE: 'PATCH', DELETE: 'PATCH' },
  REGULATORY_UPDATE: { CREATE: 'MINOR', UPDATE: 'PATCH', DELETE: 'PATCH' },
  FURNISHER: { CREATE: 'MINOR', UPDATE: 'PATCH', DELETE: 'PATCH' },
  FURNISHER_OBLIGATION: { CREATE: 'MINOR', UPDATE: 'PATCH', DELETE: 'PATCH' },
  FURNISHER_VALIDATION: { CREATE: 'MINOR', UPDATE: 'PATCH', DELETE: 'PATCH' }
};

export function getOperationLevel(entityType: string, actionType: string): SemVerLevel | null {
  return OPERATION_LEVEL_MAP[entityType]?.[actionType] || null;
}

export function determineHighestLevel(operations: {entityType: string, actionType: string}[]): SemVerLevel | 'none' {
  let highest: SemVerLevel | 'none' = 'none';

  for (const op of operations) {
    const level = getOperationLevel(op.entityType, op.actionType);
    if (!level) continue;

    if (level === 'MAJOR') return 'MAJOR'; // Highest possible, can early exit
        if (level === 'MINOR' && highest !== 'MINOR') highest = 'MINOR';
    if (level === 'PATCH' && highest === 'none') highest = 'PATCH';
  }

  return highest;
}

export function calculateNextSemVer(currentVersion: string, highestLevel: SemVerLevel): string {
  const parts = currentVersion.split(".");
  let major = parseInt(parts[0], 10);
  let minor = parseInt(parts[1], 10);
  let patch = parseInt(parts[2], 10);

  if (isNaN(major)) major = 1;
  if (isNaN(minor)) minor = 0;
  if (isNaN(patch)) patch = 0;

  if (highestLevel === 'MAJOR') {
    return `${major + 1}.0.0`;
  } else if (highestLevel === 'MINOR') {
    return `${major}.${minor + 1}.0`;
  } else {
    return `${major}.${minor}.${patch + 1}`;
  }
}

/**
 * @deprecated Use calculateNextSemVer instead.
 */
export function calculateNextVersion(
  currentVersion: string,
  previousLineCount: number,
  currentLineCount: number
): string {
  const diff = Math.abs(currentLineCount - previousLineCount);

  // 0% change -> return currentVersion unchanged
  if (diff === 0) return currentVersion;

  let percentage = 0;
  if (previousLineCount === 0) {
    percentage = currentLineCount === 0 ? 0 : 100;
  } else {
    percentage = (diff / previousLineCount) * 100;
  }

  if (percentage === 0) return currentVersion;

  percentage = parseFloat(percentage.toPrecision(4));

  // Decompose percentage
  const majorIncrement = Math.floor(percentage / 100);
  let remaining = percentage % 100;

  // Protect against floating point precision issues during modulo
  remaining = parseFloat(remaining.toFixed(6));

  const minorIncrement = Math.floor(remaining / 10);
  remaining = remaining % 10;
  remaining = parseFloat(remaining.toFixed(6));

  const patchValue = remaining;

  const formatPatch = (num: number): string => {
    // Trims trailing zeros and trailing dots
    const s = num.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
    if (s === "0") return "0";
    if (s.startsWith("0.")) return s.substring(2);
    return s.replace(".", "");
  };

  const getDecimalDigits = (num: number): string => {
    const s = num.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
    const parts = s.split(".");
    return parts.length > 1 ? parts[1] : "";
  };

  const parts = currentVersion.split(".");
  const major = parseInt(parts[0], 10) || 0;
  const minor = parseInt(parts[1], 10) || 0;
  const patchStr = parts[2] || "0";

  // Apply increment rules
  if (majorIncrement > 0) {
    // Higher-level changes reset lower levels
    return `${major + majorIncrement}.${minorIncrement}.${formatPatch(
      patchValue
    )}`;
  } else if (minorIncrement > 0) {
    // Minor change resets patch
    return `${major}.${minor + minorIncrement}.${formatPatch(patchValue)}`;
  } else {
    // Patch level changes
    const patchInt = Math.floor(patchValue);
    const decStr = getDecimalDigits(patchValue);

    if (patchInt >= 1) {
      const currentPatchInt = parseInt(patchStr, 10) || 0;
      return `${major}.${minor}.${currentPatchInt + patchInt}${decStr}`;
    } else {
      // Sub-1% change
      if (patchValue > 0) {
        return `${major}.${minor}.${patchStr}${decStr}`;
      }
      return currentVersion;
    }
  }
}