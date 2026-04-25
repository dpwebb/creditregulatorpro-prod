export function getViolationLabel(category: string | null | undefined): string {
  if (!category) return "Unknown Problem";

  const labels: Record<string, string> = {
    DOCUMENTATION_CHAIN_FAILURE: "Missing Required Information",
    DISCLOSURE_DEFICIENCY: "Required Info Not Shared with You",
    STATUTE_OF_LIMITATIONS: "Too Old to Be on Your Report — Must Be Removed",
    STATUTE_APPROACHING: "Almost Too Old for Your Report — Removal Coming Soon",
    TEMPORAL_MANIPULATION: "Dates Were Changed Suspiciously",
    BALANCE_CALCULATION_VIOLATION: "Balance Doesn't Add Up",
    ACCOUNT_STATUS_INCONSISTENCY: "Account Status Doesn't Match",
    PAYMENT_HISTORY_MANIPULATION: "Payment History Issue",
    CROSS_ENTITY_DISCREPANCY: "Different Companies Show Different Info",
    MULTIPLE_COLLECTOR_VIOLATION: "More Than One Collector on the Same Debt",
    BANKRUPTCY_DISCHARGE_VIOLATION: "Bankruptcy Was Ignored",
    IDENTITY_THEFT_VIOLATION: "Possible Identity Theft",
    CREDIT_LIMIT_MANIPULATION: "Credit Limit Doesn't Match",
    PROCEDURAL_TIMING_VIOLATION: "They Took Too Long to Respond",
    CREDITOR_RESPONSE_QUALITY: "Their Response Wasn't Good Enough",
    CROSS_BUREAU_INCONSISTENCY: "Credit Companies Show Different Info",
    RESPONSE_MOV_MISSING: "They Didn't Show How They Checked",
    RESPONSE_INCOMPLETE: "Their Reply Was Missing Information",
    RESPONSE_NO_DOCUMENTATION: "No Proof Was Provided",
    RESPONSE_ADDRESS_MISMATCH: "Wrong Address in Their Reply",
    RESPONSE_UNAUTHORIZED: "Response from Wrong Company",
    BUREAU_INVESTIGATION_FAILURE: "They Didn't Finish Checking",
    BUREAU_NOTIFICATION_FAILURE: "They Didn't Tell You What They Should Have",
    BUREAU_REINSERTION_VIOLATION: "Something Removed Came Back",
    BUREAU_ACCESS_VIOLATION: "Someone Looked at Your Report Without Permission",
    BUREAU_DISPUTE_MARKING_FAILURE: "Your Dispute Wasn't Noted on the Report",
    FURNISHER_REAGING_VIOLATION: "They Changed the Dates on Your Account",
    FURNISHER_STATUS_CODE_MISMATCH: "Account Status Doesn't Agree",
    FURNISHER_JOINT_ACCOUNT_VIOLATION: "Joint Account Reported Wrong",
    FURNISHER_AUTHORIZED_USER_MISREPRESENTATION: "You're Shown as Owing When You Shouldn't Be",
    FURNISHER_POST_DISPUTE_RETALIATION: "They Made It Worse After You Disputed",
    COLLECTOR_LICENSE_FAILURE: "Collector Isn't Licensed",
    COLLECTOR_UNAUTHORIZED_FEES: "Extra Fees Were Added",
    COLLECTOR_PAYMENT_ACKNOWLEDGMENT_VIOLATION: "Your Payment Wasn't Counted",
    COLLECTOR_DUPLICATE_REPORTING: "Same Debt Showing Up Twice",
    COLLECTOR_STATUTE_REVIVAL_ATTEMPT: "Old Debt Being Brought Back",
    PHANTOM_DEBT_UNVERIFIABLE: "Debt That Can't Be Proven",
    RETROACTIVE_HISTORY_MANIPULATION: "Payment History Was Changed",
    DATE_LOGIC_IMPOSSIBLE: "The Dates Don't Make Sense",
    STALE_REPORTING_FAILURE: "Information Wasn't Kept Up-to-Date",
    CONSUMER_STATEMENT_SUPPRESSION: "Your Statement Was Hidden",
    INVESTIGATION_RUBBER_STAMP: "They Didn't Really Investigate",
    CLOSED_ACCOUNT_BALANCE_INFLATION: "Closed Account Shows a Higher Balance",
    ZOMBIE_DEBT_RESURRECTION: "Debt That Was Removed Came Back",
    LAST_ACTIVITY_DATE_MANIPULATION: "Last Activity Date Was Changed",
    COLLECTION_LIMITATION_EXCEEDED: "Collection Activity Past the Legal Time Limit",
    MIXED_FILE_PERSONAL_INFO_MISMATCH: "Your Personal Info Doesn't Match the Report",
    CONSENT_WITHDRAWAL_NOT_HONORED: "They Kept Reporting After You Said Stop",
    FREEZE_PERIOD_VIOLATION: "Activity During Your Credit Freeze",
  };

  if (labels[category]) {
    return labels[category];
  }

  // Fallback: title case with spaces
  return category
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}