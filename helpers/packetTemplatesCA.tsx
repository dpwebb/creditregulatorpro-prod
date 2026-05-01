import type { LetterContent } from "./pdfGenerator";



// Re-export all templates from their respective files
export { ontarioCRA, novaScotiaCRA, britishColumbiaCRA, newBrunswickCRA, princeEdwardIslandCRA } from "./packetTemplatesCRA";
export { manitobaCPA, yukonCPA, northwestTerritoriesCPA, nunavutCPA } from "./packetTemplatesCPA";
export { saskatchewanCPBPA, newfoundlandLabradorCPBPA } from "./packetTemplatesCPBPA";
export { quebecCreditAgents, albertaPIPA } from "./packetTemplatesOther";

/**
 * Context object containing all necessary information for generating a dispute letter.
 */
export interface TemplateContext {
  // Consumer information
  consumerName: string;
  consumerAddress: string[];
  consumerDOB?: string;
  consumerPhone?: string;
  consumerEmail?: string;
  
  // Recipient information
  recipientName: string;
  recipientAddress: string[];
  
  // Account and dispute details
  accountNumber?: string;
  creditorName?: string;
  disputedItems: Array<{
    description: string;
    reason: string;
  }>;
  
  // Additional context
  additionalNotes?: string;
  
  // Statute information
  statuteSection?: string;
  statuteDescription?: string;
  statuteSourceUrl?: string;
}

/**
 * Helper to format disputed items list
 */
export function formatDisputedItems(items: TemplateContext["disputedItems"]): string {
  const vectorLabels: Record<string, string> = {
    AUTHORITY_TO_REPORT: "Authority to report this account",
    PERMISSIBLE_PURPOSE: "Permissible purpose for reporting or accessing this account",
    VERIFICATION_METHOD: "How the disputed information was verified",
    COMPLETENESS_ATTESTATION: "Completeness of the account information",
    ACCURACY_ATTESTATION: "Accuracy of the account information",
    TIMING_COMPLIANCE: "Compliance with investigation and response timelines",
    INVESTIGATION_PROCEDURE: "The procedure used to investigate this dispute",
  };

  const humanizeCode = (value: string): string => {
    const trimmed = value.trim();
    if (vectorLabels[trimmed]) return vectorLabels[trimmed];
    if (/^[A-Z0-9_]+$/.test(trimmed)) {
      const words = trimmed.toLowerCase().replace(/_/g, " ");
      return words.charAt(0).toUpperCase() + words.slice(1);
    }
    return trimmed;
  };

  return items
    .map((item, index) => {
      const description = humanizeCode(item.description);
      const reason = item.reason?.trim();
      return reason
        ? `${index + 1}. ${description}\n   Why I am disputing it: ${reason}`
        : `${index + 1}. ${description}`;
    })
    .join("\n\n");
}

/**
 * Helper to format account identification section
 */
export function formatAccountIdentification(ctx: TemplateContext): string {
  const parts: string[] = [];
  if (ctx.creditorName) {
    parts.push(`Creditor: ${ctx.creditorName}`);
  }
  if (ctx.accountNumber) {
    const normalized = ctx.accountNumber.trim().toLowerCase();
    const displayAccountNumber =
      normalized === "unknown" ||
      normalized === "not reported" ||
      normalized === "not provided in consumer disclosure"
        ? "Not reported by bureau"
        : ctx.accountNumber;
    parts.push(`Account Number: ${displayAccountNumber}`);
  }
  return parts.join("\n");
}
