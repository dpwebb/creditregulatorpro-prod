import type { ParsedTradeline } from "./reportParser";

/**
 * Helper function to determine if a tradeline is a medical account
 */
export function isMedicalAccount(tl: ParsedTradeline): boolean {
  const medicalKeywords = ["medical", "hospital", "health", "clinic", "doctor", "physician"];
  const accountTypeLower = (tl.accountType || "").toLowerCase();
  const creditorNameLower = (tl.creditorName || "").toLowerCase();
  
  return medicalKeywords.some(keyword => 
    accountTypeLower.includes(keyword) || creditorNameLower.includes(keyword)
  );
}

/**
 * Helper function to determine if a tradeline is a student loan account
 */
export function isStudentLoanAccount(tl: ParsedTradeline): boolean {
  const studentLoanKeywords = ["student", "education", "nslsc", "student loan"];
  const accountTypeLower = (tl.accountType || "").toLowerCase();
  const creditorNameLower = (tl.creditorName || "").toLowerCase();
  
  return studentLoanKeywords.some(keyword => 
    accountTypeLower.includes(keyword) || creditorNameLower.includes(keyword)
  );
}

/**
 * Helper function to determine if a tradeline is a collection account
 */
export function isCollectionAccount(tl: ParsedTradeline): boolean {
  const collectionKeywords = ["collection", "collector", "recovery", "collections"];
  const statusLower = (tl.status || "").toLowerCase();
  const creditorNameLower = (tl.creditorName || "").toLowerCase();
  const accountTypeLower = (tl.accountType || "").toLowerCase();
  
  return collectionKeywords.some(keyword => 
    statusLower.includes(keyword) || 
    creditorNameLower.includes(keyword) ||
    accountTypeLower.includes(keyword)
  );
}