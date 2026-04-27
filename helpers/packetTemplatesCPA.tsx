import type { LetterContent } from "./pdfGenerator";
import {
  generateTrackingPlaceholder,
  getCertifiedMailInstructions,
} from "./trackingPlaceholders";
import type { TemplateContext } from "./packetTemplatesCA";
import { formatDisputedItems, formatAccountIdentification } from "./packetTemplatesCA";
import { applyTemplateOverrides } from "./letterTemplateQueries";

/**
 * Manitoba Consumer Protection Act dispute template
 */
export async function manitobaCPA(ctx: TemplateContext): Promise<LetterContent> {
  const trackingPlaceholder = generateTrackingPlaceholder();
  const deliveryInstructions = getCertifiedMailInstructions("MB");
  
  const letterDate = new Date().toLocaleDateString("en-CA");
  
  let statutoryGrounds = "Under Part VIII of the Consumer Protection Act dealing with consumer reporting, you are required to maintain reasonable procedures to ensure accuracy of consumer reports.";
  
  if (ctx.statuteSection || ctx.statuteDescription) {
    statutoryGrounds = `This dispute is based on ${ctx.statuteSection || "the Consumer Protection Act"}.`;
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
    subject: "Re: Formal Dispute of Consumer Report Information under Manitoba Consumer Protection Act, C.C.S.M. c. C200",
    introduction: "I am writing to formally dispute information contained in my consumer report maintained by your agency. This dispute is submitted pursuant to the Manitoba Consumer Protection Act, C.C.S.M. c. C200, and I request that you conduct a reasonable investigation as required by statute.",
    accountIdentification: formatAccountIdentification(ctx),
    disputedItems: formatDisputedItems(ctx.disputedItems),
    statutoryGrounds,
    supportingDocumentation: "Relevant documentation supporting this dispute is enclosed. Please review these materials as part of your statutory investigation.",
    requestedAction: "I request that you:\n1. Conduct a reasonable investigation of the disputed information;\n2. Correct or delete any information found to be inaccurate or unverifiable;\n3. Provide me with written confirmation of the results of your investigation;\n4. Notify all parties to whom the report was provided in the past six months of any corrections or deletions.",
    statutoryTimeframe: "Under Manitoba law, you are required to complete your investigation within a reasonable time. I expect a response within 30 days of receipt of this letter.",
    consumerStatementRight: "Should the investigation not resolve this matter to my satisfaction, I reserve my right under the Act to have a consumer statement included in my file.",
    deliveryConfirmation: `This letter is being sent via ${deliveryInstructions.serviceName} to establish proof of delivery.`,
    certification: "I certify under penalty of law that the information provided in this letter is true and accurate to the best of my knowledge.",
    closing: "Sincerely,",
    statutoryReference: ctx.statuteSection 
      ? `Reference: ${ctx.statuteSection}`
      : "Reference: Consumer Protection Act, C.C.S.M. c. C200, Part VIII",
    sourceUrl: ctx.statuteSourceUrl || "https://web2.gov.mb.ca/laws/statutes/ccsm/c200e.php",
    trackingPlaceholder,
    deliveryInstructions: `${deliveryInstructions.serviceName} - ${deliveryInstructions.warning}`,
  };
  
  return applyTemplateOverrides(content, "provincial", "manitoba_cpa");
}

/**
 * Yukon Consumer Protection Act dispute template
 */
export async function yukonCPA(ctx: TemplateContext): Promise<LetterContent> {
  const trackingPlaceholder = generateTrackingPlaceholder();
  const deliveryInstructions = getCertifiedMailInstructions("YT");
  
  const letterDate = new Date().toLocaleDateString("en-CA");
  
  let statutoryGrounds = "Under the Consumer Protection Act provisions relating to consumer reporting, you are required to maintain reasonable procedures to ensure accuracy of consumer reports.";
  
  if (ctx.statuteSection || ctx.statuteDescription) {
    statutoryGrounds = `This dispute is based on ${ctx.statuteSection || "the Consumer Protection Act"}.`;
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
    subject: "Re: Formal Dispute of Consumer Report Information under Yukon Consumer Protection Act, R.S.Y. 2002, c. 40",
    introduction: "I am writing to formally dispute information contained in my consumer report maintained by your agency. This dispute is submitted pursuant to the Yukon Consumer Protection Act, R.S.Y. 2002, c. 40, and I request that you conduct a reasonable investigation as required by statute.",
    accountIdentification: formatAccountIdentification(ctx),
    disputedItems: formatDisputedItems(ctx.disputedItems),
    statutoryGrounds,
    supportingDocumentation: "Relevant documentation supporting this dispute is enclosed. Please review these materials as part of your statutory investigation.",
    requestedAction: "I request that you:\n1. Conduct a reasonable investigation of the disputed information;\n2. Correct or delete any information found to be inaccurate or unverifiable;\n3. Provide me with written confirmation of the results of your investigation;\n4. Notify all parties to whom the report was provided in the past six months of any corrections or deletions.",
    statutoryTimeframe: "Under Yukon law, you are required to complete your investigation within a reasonable time. I expect a response within 30 days of receipt of this letter.",
    consumerStatementRight: "Should the investigation not resolve this matter to my satisfaction, I reserve my right under the Act to have a consumer statement included in my file.",
    deliveryConfirmation: `This letter is being sent via ${deliveryInstructions.serviceName} to establish proof of delivery.`,
    certification: "I certify under penalty of law that the information provided in this letter is true and accurate to the best of my knowledge.",
    closing: "Sincerely,",
    statutoryReference: ctx.statuteSection 
      ? `Reference: ${ctx.statuteSection}`
      : "Reference: Consumer Protection Act, R.S.Y. 2002, c. 40",
    sourceUrl: ctx.statuteSourceUrl || "https://www.yukonconsumer.ca/",
    trackingPlaceholder,
    deliveryInstructions: `${deliveryInstructions.serviceName} - ${deliveryInstructions.warning}`,
  };
  
  return applyTemplateOverrides(content, "provincial", "yukon_cpa");
}

/**
 * Northwest Territories Consumer Protection Act dispute template
 */
export async function northwestTerritoriesCPA(ctx: TemplateContext): Promise<LetterContent> {
  const trackingPlaceholder = generateTrackingPlaceholder();
  const deliveryInstructions = getCertifiedMailInstructions("NT");
  
  const letterDate = new Date().toLocaleDateString("en-CA");
  
  let statutoryGrounds = "Under the Consumer Protection Act provisions relating to consumer reporting, you are required to maintain reasonable procedures to ensure accuracy of consumer reports.";
  
  if (ctx.statuteSection || ctx.statuteDescription) {
    statutoryGrounds = `This dispute is based on ${ctx.statuteSection || "the Consumer Protection Act"}.`;
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
    subject: "Re: Formal Dispute of Consumer Report Information under Northwest Territories Consumer Protection Act, S.N.W.T. 2007, c. 11",
    introduction: "I am writing to formally dispute information contained in my consumer report maintained by your agency. This dispute is submitted pursuant to the Northwest Territories Consumer Protection Act, S.N.W.T. 2007, c. 11, and I request that you conduct a reasonable investigation as required by statute.",
    accountIdentification: formatAccountIdentification(ctx),
    disputedItems: formatDisputedItems(ctx.disputedItems),
    statutoryGrounds,
    supportingDocumentation: "Relevant documentation supporting this dispute is enclosed. Please review these materials as part of your statutory investigation.",
    requestedAction: "I request that you:\n1. Conduct a reasonable investigation of the disputed information;\n2. Correct or delete any information found to be inaccurate or unverifiable;\n3. Provide me with written confirmation of the results of your investigation;\n4. Notify all parties to whom the report was provided in the past six months of any corrections or deletions.",
    statutoryTimeframe: "Under Northwest Territories law, you are required to complete your investigation within a reasonable time. I expect a response within 30 days of receipt of this letter.",
    consumerStatementRight: "Should the investigation not resolve this matter to my satisfaction, I reserve my right under the Act to have a consumer statement included in my file.",
    deliveryConfirmation: `This letter is being sent via ${deliveryInstructions.serviceName} to establish proof of delivery.`,
    certification: "I certify under penalty of law that the information provided in this letter is true and accurate to the best of my knowledge.",
    closing: "Sincerely,",
    statutoryReference: ctx.statuteSection 
      ? `Reference: ${ctx.statuteSection}`
      : "Reference: Consumer Protection Act, S.N.W.T. 2007, c. 11",
    sourceUrl: ctx.statuteSourceUrl || "https://www.justice.gov.nt.ca/en/",
    trackingPlaceholder,
    deliveryInstructions: `${deliveryInstructions.serviceName} - ${deliveryInstructions.warning}`,
  };
  
  return applyTemplateOverrides(content, "provincial", "nwt_cpa");
}

/**
 * Nunavut Consumer Protection Act dispute template
 */
export async function nunavutCPA(ctx: TemplateContext): Promise<LetterContent> {
  const trackingPlaceholder = generateTrackingPlaceholder();
  const deliveryInstructions = getCertifiedMailInstructions("NU");
  
  const letterDate = new Date().toLocaleDateString("en-CA");
  
  let statutoryGrounds = "Under the Consumer Protection Act provisions relating to consumer reporting, you are required to maintain reasonable procedures to ensure accuracy of consumer reports.";
  
  if (ctx.statuteSection || ctx.statuteDescription) {
    statutoryGrounds = `This dispute is based on ${ctx.statuteSection || "the Consumer Protection Act"}.`;
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
    subject: "Re: Formal Dispute of Consumer Report Information under Nunavut Consumer Protection Act, R.S.N.W.T. (Nu) 1988, c. C-17",
    introduction: "I am writing to formally dispute information contained in my consumer report maintained by your agency. This dispute is submitted pursuant to the Nunavut Consumer Protection Act, R.S.N.W.T. (Nu) 1988, c. C-17, and I request that you conduct a reasonable investigation as required by statute.",
    accountIdentification: formatAccountIdentification(ctx),
    disputedItems: formatDisputedItems(ctx.disputedItems),
    statutoryGrounds,
    supportingDocumentation: "Relevant documentation supporting this dispute is enclosed. Please review these materials as part of your statutory investigation.",
    requestedAction: "I request that you:\n1. Conduct a reasonable investigation of the disputed information;\n2. Correct or delete any information found to be inaccurate or unverifiable;\n3. Provide me with written confirmation of the results of your investigation;\n4. Notify all parties to whom the report was provided in the past six months of any corrections or deletions.",
    statutoryTimeframe: "Under Nunavut law, you are required to complete your investigation within a reasonable time. I expect a response within 30 days of receipt of this letter.",
    consumerStatementRight: "Should the investigation not resolve this matter to my satisfaction, I reserve my right under the Act to have a consumer statement included in my file.",
    deliveryConfirmation: `This letter is being sent via ${deliveryInstructions.serviceName} to establish proof of delivery.`,
    certification: "I certify under penalty of law that the information provided in this letter is true and accurate to the best of my knowledge.",
    closing: "Sincerely,",
    statutoryReference: ctx.statuteSection 
      ? `Reference: ${ctx.statuteSection}`
      : "Reference: Consumer Protection Act, R.S.N.W.T. (Nu) 1988, c. C-17",
    sourceUrl: ctx.statuteSourceUrl || "https://www.nunavutlegislation.ca/",
    trackingPlaceholder,
    deliveryInstructions: `${deliveryInstructions.serviceName} - ${deliveryInstructions.warning}`,
  };
  
  return applyTemplateOverrides(content, "provincial", "nunavut_cpa");
}