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
  return items
    .map((item, index) => `${index + 1}. ${item.description}\n   Reason: ${item.reason}`)
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
    parts.push(`Account Number: ${ctx.accountNumber}`);
  }
  return parts.join("\n");
}