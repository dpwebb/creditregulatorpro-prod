import type { LetterContent } from "./pdfGenerator";
import {
  generateTrackingPlaceholder,
  getCertifiedMailInstructions,
} from "./trackingPlaceholders";
import type { TemplateContext } from "./packetTemplatesCA";
import { finalizeProvincialLetter, formatDisputedItems, formatAccountIdentification } from "./packetTemplatesCA";

/**
 * Saskatchewan Consumer Protection and Business Practices Act dispute template
 */
export async function saskatchewanCPBPA(ctx: TemplateContext): Promise<LetterContent> {
  const trackingPlaceholder = generateTrackingPlaceholder();
  const deliveryInstructions = getCertifiedMailInstructions("SK");
  
  const letterDate = new Date().toLocaleDateString("en-CA");
  
  let statutoryGrounds = "Under Part 8 of the Consumer Protection and Business Practices Act, you are required to maintain reasonable procedures to ensure accuracy of consumer reports.";
  
  if (ctx.statuteSection || ctx.statuteDescription) {
    statutoryGrounds = `This dispute is based on ${ctx.statuteSection || "the Consumer Protection and Business Practices Act"}.`;
    if (ctx.statuteDescription) {
      statutoryGrounds += ` ${ctx.statuteDescription}`;
    }
    statutoryGrounds += " I assert that the disputed items do not meet this statutory standard and request immediate investigation.";
  } else {
    statutoryGrounds += " I assert that the disputed items do not meet this statutory standard and request immediate investigation.";
  }
  
  const content: LetterContent = {
    consumerName: ctx.consumerName,
    consumerAddress: ctx.consumerAddress,
    consumerDOB: ctx.consumerDOB,
    consumerPhone: ctx.consumerPhone,
    consumerEmail: ctx.consumerEmail,
    letterDate,
    recipientName: ctx.recipientName,
    recipientAddress: ctx.recipientAddress,
    subject: "Re: Formal Dispute of Consumer Report Information under Saskatchewan Consumer Protection and Business Practices Act, S.S. 2014, c. C-30.2",
    introduction: "I am writing to formally dispute information contained in my consumer report maintained by your agency. This dispute is submitted pursuant to the Saskatchewan Consumer Protection and Business Practices Act, S.S. 2014, c. C-30.2, and I request that you conduct a reasonable investigation as required by statute.",
    accountIdentification: formatAccountIdentification(ctx),
    disputedItems: formatDisputedItems(ctx.disputedItems),
    statutoryGrounds,
    supportingDocumentation: "Relevant documentation supporting this dispute is enclosed. Please review these materials as part of your statutory investigation.",
    requestedAction: "I request that you:\n1. Conduct a reasonable investigation of the disputed information;\n2. Correct or delete any information found to be inaccurate or unverifiable;\n3. Provide me with written confirmation of the results of your investigation;\n4. Notify all parties to whom the report was provided in the past six months of any corrections or deletions.",
    statutoryTimeframe: "Under Saskatchewan law, you are required to complete your investigation within a reasonable time. I expect a response within 30 days of receipt of this letter.",
    consumerStatementRight: "Should the investigation not resolve this matter to my satisfaction, I reserve my right under the Act to have a consumer statement included in my file.",
    deliveryConfirmation: `This letter is being sent via ${deliveryInstructions.serviceName} to establish proof of delivery.`,
    certification: "I certify under penalty of law that the information provided in this letter is true and accurate to the best of my knowledge.",
    closing: "Sincerely,",
    statutoryReference: ctx.statuteSection 
      ? `Reference: ${ctx.statuteSection}`
      : "Reference: Consumer Protection and Business Practices Act, S.S. 2014, c. C-30.2, Part 8",
    sourceUrl: ctx.statuteSourceUrl || "https://www.canlii.org/en/sk/laws/stat/ss-2014-c-c-30.2/latest/",
    trackingPlaceholder,
    deliveryInstructions: `${deliveryInstructions.serviceName} - ${deliveryInstructions.warning}`,
  };
  
  return finalizeProvincialLetter(content, "saskatchewan_cpbpa", ctx);
}

/**
 * Newfoundland and Labrador Consumer Protection and Business Practices Act dispute template
 */
export async function newfoundlandLabradorCPBPA(ctx: TemplateContext): Promise<LetterContent> {
  const trackingPlaceholder = generateTrackingPlaceholder();
  const deliveryInstructions = getCertifiedMailInstructions("NL");
  
  const letterDate = new Date().toLocaleDateString("en-CA");
  
  let statutoryGrounds = "Under Part III of the Consumer Protection and Business Practices Act dealing with consumer reporting, you are required to maintain reasonable procedures to ensure accuracy of consumer reports.";
  
  if (ctx.statuteSection || ctx.statuteDescription) {
    statutoryGrounds = `This dispute is based on ${ctx.statuteSection || "the Consumer Protection and Business Practices Act"}.`;
    if (ctx.statuteDescription) {
      statutoryGrounds += ` ${ctx.statuteDescription}`;
    }
    statutoryGrounds += " I assert that the disputed items do not meet this statutory standard and request immediate investigation.";
  } else {
    statutoryGrounds += " I assert that the disputed items do not meet this statutory standard and request immediate investigation.";
  }
  
  const content: LetterContent = {
    consumerName: ctx.consumerName,
    consumerAddress: ctx.consumerAddress,
    consumerDOB: ctx.consumerDOB,
    consumerPhone: ctx.consumerPhone,
    consumerEmail: ctx.consumerEmail,
    letterDate,
    recipientName: ctx.recipientName,
    recipientAddress: ctx.recipientAddress,
    subject: "Re: Formal Dispute of Consumer Report Information under Newfoundland and Labrador Consumer Protection and Business Practices Act, S.N.L. 2009, c. C-31.1",
    introduction: "I am writing to formally dispute information contained in my consumer report maintained by your agency. This dispute is submitted pursuant to the Newfoundland and Labrador Consumer Protection and Business Practices Act, S.N.L. 2009, c. C-31.1, and I request that you conduct a reasonable investigation as required by statute.",
    accountIdentification: formatAccountIdentification(ctx),
    disputedItems: formatDisputedItems(ctx.disputedItems),
    statutoryGrounds,
    supportingDocumentation: "Relevant documentation supporting this dispute is enclosed. Please review these materials as part of your statutory investigation.",
    requestedAction: "I request that you:\n1. Conduct a reasonable investigation of the disputed information;\n2. Correct or delete any information found to be inaccurate or unverifiable;\n3. Provide me with written confirmation of the results of your investigation;\n4. Notify all parties to whom the report was provided in the past six months of any corrections or deletions.",
    statutoryTimeframe: "Under Newfoundland and Labrador law, you are required to complete your investigation within a reasonable time. I expect a response within 30 days of receipt of this letter.",
    consumerStatementRight: "Should the investigation not resolve this matter to my satisfaction, I reserve my right under the Act to have a consumer statement included in my file.",
    deliveryConfirmation: `This letter is being sent via ${deliveryInstructions.serviceName} to establish proof of delivery.`,
    certification: "I certify under penalty of law that the information provided in this letter is true and accurate to the best of my knowledge.",
    closing: "Sincerely,",
    statutoryReference: ctx.statuteSection 
      ? `Reference: ${ctx.statuteSection}`
      : "Reference: Consumer Protection and Business Practices Act, S.N.L. 2009, c. C-31.1, Part III",
    sourceUrl: ctx.statuteSourceUrl || "https://www.assembly.nl.ca/legislation/sr/statutes/c31-1.htm",
    trackingPlaceholder,
    deliveryInstructions: `${deliveryInstructions.serviceName} - ${deliveryInstructions.warning}`,
  };
  
  return finalizeProvincialLetter(content, "nl_cpbpa", ctx);
}
