import type { ViolationCategory, ValidationSeverity } from "./schema";

export interface DetectedViolation {
  violationCategory: ViolationCategory;
  severity: ValidationSeverity;
  confidenceScore: number; // 0-100
  userExplanation: string; // Plain language, no regulatory jargon
  technicalDetails: Record<string, any>; // Raw data for admins
  recommendedAction: string;
  tradelineId?: number;
  responsibleEntity?: "BUREAU" | "CREDITOR" | "COLLECTOR";
}

export interface TradelineForCollectionCheck {
  isCollectionAccount?: boolean | null;
  collectionAgencyName?: string | null;
  status?: string | null;
  accountType?: string | null;
  sourceText?: string | null;
  notes?: string | null;
}

export function isEffectivelyCollectionAccount(tradeline: TradelineForCollectionCheck): boolean {
  if (tradeline.isCollectionAccount) {
    return true;
  }

  if (typeof tradeline.collectionAgencyName === "string" && tradeline.collectionAgencyName.trim().length > 0) {
    return true;
  }

  if (typeof tradeline.status === "string") {
    const segments = tradeline.status.split(",");
    for (const segment of segments) {
      const trimmed = segment.trim().toUpperCase();
      if (trimmed.startsWith("TC")) return true;
      if (trimmed.includes("COLLECTION")) return true;
    }
  }

  if (typeof tradeline.accountType === "string" && tradeline.accountType.toUpperCase().includes("COLLECTION")) {
    return true;
  }

  const sourceEvidence = `${tradeline.sourceText || ""} ${tradeline.notes || ""}`.toUpperCase();
  if (
    /(?:^|[^A-Z0-9])TC(?:[^A-Z0-9]|$)/.test(sourceEvidence) ||
    sourceEvidence.includes("THIRD PARTY COLLECTION") ||
    sourceEvidence.includes("TURNED OVER TO COLLECTION")
  ) {
    return true;
  }

  return false;
}
