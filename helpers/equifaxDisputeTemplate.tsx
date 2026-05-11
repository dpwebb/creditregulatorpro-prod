export interface TradelineDetails {
  [key: string]: any;
  accountNumber?: string | null;
  accountType?: string | null;
  balance?: string | number | null;
  collectionAgencyName?: string | null;
  creditLimit?: string | number | null;
  dateOfFirstDelinquency?: string | Date | null;
  dateOfLastPayment?: string | Date | null;
  highCredit?: string | number | null;
  lastActivityDate?: string | Date | null;
  openedDate?: string | Date | null;
  status?: string | null;
}

export interface ViolationDetails {
  [key: string]: any;
  detectedValue?: string | null;
  duplicateAccountNumber?: string | null;
  duplicateCreditorName?: string | null;
  expectedValue?: string | null;
  fieldName?: string | null;
  matchReason?: string | null;
  notes?: string | null;
  omissions?: any;
  originalCreditorName?: string | null;
  otherAgencyName?: string | null;
  otherBalance?: string | number | null;
  technicalDetails?: Record<string, any> | null;
  userExplanation?: string | null;
}

export function checkDofdSolObstruction(
  violationCategory?: string | null,
  violationDetails?: ViolationDetails | null,
  tradelineDetails?: TradelineDetails | null
): boolean {
  const category = violationCategory || "";
  if (!["DOCUMENTATION_CHAIN_FAILURE", "METRO2_FIELD_VIOLATION", "DOFD_REPORTING"].includes(category)) {
    return false;
  }

  const fieldName = String(violationDetails?.fieldName || "").toLowerCase();
  const detectedValue = String(violationDetails?.detectedValue || "").toLowerCase();
  const expectedValue = String(violationDetails?.expectedValue || "").toLowerCase();

  return (
    !tradelineDetails?.dateOfFirstDelinquency &&
    (fieldName.includes("dofd") ||
      fieldName.includes("first delinquency") ||
      detectedValue.includes("dofd") ||
      detectedValue.includes("first delinquency") ||
      expectedValue.includes("first delinquency"))
  );
}
