import type { LetterContent } from "./pdfGenerator";
import {
  generateTrackingPlaceholder,
  getCertifiedMailInstructions,
} from "./trackingPlaceholders";
import type { TemplateContext } from "./packetTemplatesCA";
import { formatDisputedItems, formatAccountIdentification } from "./packetTemplatesCA";
import { applyTemplateOverrides } from "./letterTemplateQueries";

/**
 * Ontario Consumer Reporting Act dispute template
 */
export async function ontarioCRA(ctx: TemplateContext): Promise<LetterContent> {
  const trackingPlaceholder = generateTrackingPlaceholder();
  const deliveryInstructions = getCertifiedMailInstructions("ON");
  
  const letterDate = new Date().toLocaleDateString("en-CA");
  
  // Build detailed statutory grounds with specific section if available
  let statutoryGrounds = "Under Section 12 of the Consumer Reporting Act, you are required to follow reasonable procedures to ensure maximum possible accuracy of consumer reports.";
  
  if (ctx.statuteSection || ctx.statuteDescription) {
    statutoryGrounds = `This dispute is based on ${ctx.statuteSection || "the Consumer Reporting Act"}.`;
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
    subject: "Re: Formal Dispute of Consumer Report Information under Ontario Consumer Reporting Act, R.S.O. 1990, c. C.33",
    introduction: "I am writing to formally dispute information contained in my consumer report maintained by your agency. This dispute is submitted pursuant to the Ontario Consumer Reporting Act, R.S.O. 1990, c. C.33, and I request that you conduct a reasonable investigation as required by statute.",
    accountIdentification: formatAccountIdentification(ctx),
    disputedItems: formatDisputedItems(ctx.disputedItems),
    statutoryGrounds,
    supportingDocumentation: "Relevant documentation supporting this dispute is enclosed. Please review these materials as part of your statutory investigation.",
    requestedAction: "I request that you:\n1. Conduct a reasonable investigation of the disputed information as required by Section 12 of the Act;\n2. Correct or delete any information found to be inaccurate or unverifiable;\n3. Provide me with written confirmation of the results of your investigation;\n4. Notify all parties to whom the report was provided in the past six months of any corrections or deletions.",
    statutoryTimeframe: "Under Ontario law, you are required to complete your investigation within a reasonable time. I expect a response within 30 days of receipt of this letter.",
    consumerStatementRight: "Should the investigation not resolve this matter to my satisfaction, I reserve my right under Section 9 of the Act to have a consumer statement included in my file.",
    deliveryConfirmation: `This letter is being sent via ${deliveryInstructions.serviceName} to establish proof of delivery.`,
    certification: "I certify under penalty of law that the information provided in this letter is true and accurate to the best of my knowledge.",
    closing: "Sincerely,",
    statutoryReference: ctx.statuteSection 
      ? `Reference: ${ctx.statuteSection}`
      : "Reference: Consumer Reporting Act, R.S.O. 1990, c. C.33, Sections 9, 12",
    sourceUrl: ctx.statuteSourceUrl || "https://www.ontario.ca/laws/statute/90c33",
    trackingPlaceholder,
    deliveryInstructions: `${deliveryInstructions.serviceName} - ${deliveryInstructions.warning}`,
  };
  
  return applyTemplateOverrides(content, "provincial", "ontario_cra");
}

/**
 * Nova Scotia Consumer Reporting Act dispute template
 */
export async function novaScotiaCRA(ctx: TemplateContext): Promise<LetterContent> {
  const trackingPlaceholder = generateTrackingPlaceholder();
  const deliveryInstructions = getCertifiedMailInstructions("NS");
  
  const letterDate = new Date().toLocaleDateString("en-CA");
  
  let statutoryGrounds = "Under Section 18 of the Consumer Reporting Act, you are required to maintain reasonable procedures to ensure maximum possible accuracy of consumer reports.";
  
  if (ctx.statuteSection || ctx.statuteDescription) {
    statutoryGrounds = `This dispute is based on ${ctx.statuteSection || "the Consumer Reporting Act"}.`;
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
    subject: "Re: Formal Dispute of Consumer Report Information under Nova Scotia Consumer Reporting Act, S.N.S. 2010, c. 13",
    introduction: "I am writing to formally dispute information contained in my consumer report maintained by your agency. This dispute is submitted pursuant to the Nova Scotia Consumer Reporting Act, S.N.S. 2010, c. 13, and I request that you conduct a reasonable investigation as required by statute.",
    accountIdentification: formatAccountIdentification(ctx),
    disputedItems: formatDisputedItems(ctx.disputedItems),
    statutoryGrounds,
    supportingDocumentation: "Relevant documentation supporting this dispute is enclosed. Please review these materials as part of your statutory investigation.",
    requestedAction: "I request that you:\n1. Conduct a reasonable investigation of the disputed information as required by Section 18 of the Act;\n2. Correct or delete any information found to be inaccurate or unverifiable;\n3. Provide me with written confirmation of the results of your investigation;\n4. Notify all parties to whom the report was provided in the past six months of any corrections or deletions.",
    statutoryTimeframe: "Under Nova Scotia law, you are required to complete your investigation within a reasonable time. I expect a response within 30 days of receipt of this letter.",
    consumerStatementRight: "Should the investigation not resolve this matter to my satisfaction, I reserve my right under Section 15 of the Act to have a consumer statement included in my file.",
    deliveryConfirmation: `This letter is being sent via ${deliveryInstructions.serviceName} to establish proof of delivery.`,
    certification: "I certify under penalty of law that the information provided in this letter is true and accurate to the best of my knowledge.",
    closing: "Sincerely,",
    statutoryReference: ctx.statuteSection 
      ? `Reference: ${ctx.statuteSection}`
      : "Reference: Consumer Reporting Act, S.N.S. 2010, c. 13, Sections 15, 18",
    sourceUrl: ctx.statuteSourceUrl || "https://nslegislature.ca/sites/default/files/legc/statutes/consumer%20reporting.pdf",
    trackingPlaceholder,
    deliveryInstructions: `${deliveryInstructions.serviceName} - ${deliveryInstructions.warning}`,
  };
  
  return applyTemplateOverrides(content, "provincial", "nova_scotia_cra");
}

/**
 * British Columbia Consumer Reporting Act dispute template
 */
export async function britishColumbiaCRA(ctx: TemplateContext): Promise<LetterContent> {
  const trackingPlaceholder = generateTrackingPlaceholder();
  const deliveryInstructions = getCertifiedMailInstructions("BC");
  
  const letterDate = new Date().toLocaleDateString("en-CA");
  
  let statutoryGrounds = "Under Section 14 of the Consumer Reporting Act, you are required to follow reasonable procedures to ensure maximum possible accuracy of consumer reports.";
  
  if (ctx.statuteSection || ctx.statuteDescription) {
    statutoryGrounds = `This dispute is based on ${ctx.statuteSection || "the Consumer Reporting Act"}.`;
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
    subject: "Re: Formal Dispute of Consumer Report Information under British Columbia Consumer Reporting Act, R.S.B.C. 1996, c. 69",
    introduction: "I am writing to formally dispute information contained in my consumer report maintained by your agency. This dispute is submitted pursuant to the British Columbia Consumer Reporting Act, R.S.B.C. 1996, c. 69, and I request that you conduct a reasonable investigation as required by statute.",
    accountIdentification: formatAccountIdentification(ctx),
    disputedItems: formatDisputedItems(ctx.disputedItems),
    statutoryGrounds,
    supportingDocumentation: "Relevant documentation supporting this dispute is enclosed. Please review these materials as part of your statutory investigation.",
    requestedAction: "I request that you:\n1. Conduct a reasonable investigation of the disputed information as required by Section 14 of the Act;\n2. Correct or delete any information found to be inaccurate or unverifiable;\n3. Provide me with written confirmation of the results of your investigation;\n4. Notify all parties to whom the report was provided in the past six months of any corrections or deletions.",
    statutoryTimeframe: "Under British Columbia law, you are required to complete your investigation within a reasonable time. I expect a response within 30 days of receipt of this letter.",
    consumerStatementRight: "Should the investigation not resolve this matter to my satisfaction, I reserve my right under Section 11 of the Act to have a consumer statement included in my file.",
    deliveryConfirmation: `This letter is being sent via ${deliveryInstructions.serviceName} to establish proof of delivery.`,
    certification: "I certify under penalty of law that the information provided in this letter is true and accurate to the best of my knowledge.",
    closing: "Sincerely,",
    statutoryReference: ctx.statuteSection 
      ? `Reference: ${ctx.statuteSection}`
      : "Reference: Consumer Reporting Act, R.S.B.C. 1996, c. 69, Sections 11, 14",
    sourceUrl: ctx.statuteSourceUrl || "https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/96069_01",
    trackingPlaceholder,
    deliveryInstructions: `${deliveryInstructions.serviceName} - ${deliveryInstructions.warning}`,
  };
  
  return applyTemplateOverrides(content, "provincial", "bc_cra");
}

/**
 * New Brunswick Consumer Reporting Act dispute template
 */
export async function newBrunswickCRA(ctx: TemplateContext): Promise<LetterContent> {
  const trackingPlaceholder = generateTrackingPlaceholder();
  const deliveryInstructions = getCertifiedMailInstructions("NB");
  
  const letterDate = new Date().toLocaleDateString("en-CA");
  
  let statutoryGrounds = "Under Section 15 of the Consumer Reporting Act, you are required to maintain reasonable procedures to ensure maximum possible accuracy of consumer reports.";
  
  if (ctx.statuteSection || ctx.statuteDescription) {
    statutoryGrounds = `This dispute is based on ${ctx.statuteSection || "the Consumer Reporting Act"}.`;
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
    subject: "Re: Formal Dispute of Consumer Report Information under New Brunswick Consumer Reporting Act, S.N.B. 2009, c. C-24.3",
    introduction: "I am writing to formally dispute information contained in my consumer report maintained by your agency. This dispute is submitted pursuant to the New Brunswick Consumer Reporting Act, S.N.B. 2009, c. C-24.3, and I request that you conduct a reasonable investigation as required by statute.",
    accountIdentification: formatAccountIdentification(ctx),
    disputedItems: formatDisputedItems(ctx.disputedItems),
    statutoryGrounds,
    supportingDocumentation: "Relevant documentation supporting this dispute is enclosed. Please review these materials as part of your statutory investigation.",
    requestedAction: "I request that you:\n1. Conduct a reasonable investigation of the disputed information as required by Section 15 of the Act;\n2. Correct or delete any information found to be inaccurate or unverifiable;\n3. Provide me with written confirmation of the results of your investigation;\n4. Notify all parties to whom the report was provided in the past six months of any corrections or deletions.",
    statutoryTimeframe: "Under New Brunswick law, you are required to complete your investigation within a reasonable time. I expect a response within 30 days of receipt of this letter.",
    consumerStatementRight: "Should the investigation not resolve this matter to my satisfaction, I reserve my right under Section 12 of the Act to have a consumer statement included in my file.",
    deliveryConfirmation: `This letter is being sent via ${deliveryInstructions.serviceName} to establish proof of delivery.`,
    certification: "I certify under penalty of law that the information provided in this letter is true and accurate to the best of my knowledge.",
    closing: "Sincerely,",
    statutoryReference: ctx.statuteSection 
      ? `Reference: ${ctx.statuteSection}`
      : "Reference: Consumer Reporting Act, S.N.B. 2009, c. C-24.3, Sections 12, 15",
    sourceUrl: ctx.statuteSourceUrl || "https://www.canlii.org/en/nb/laws/stat/snb-2009-c-c-24.3/latest/",
    trackingPlaceholder,
    deliveryInstructions: `${deliveryInstructions.serviceName} - ${deliveryInstructions.warning}`,
  };
  
  return applyTemplateOverrides(content, "provincial", "new_brunswick_cra");
}

/**
 * Prince Edward Island Consumer Reporting Act dispute template
 */
export async function princeEdwardIslandCRA(ctx: TemplateContext): Promise<LetterContent> {
  const trackingPlaceholder = generateTrackingPlaceholder();
  const deliveryInstructions = getCertifiedMailInstructions("PE");
  
  const letterDate = new Date().toLocaleDateString("en-CA");
  
  let statutoryGrounds = "Under Section 12 of the Consumer Reporting Act, you are required to maintain reasonable procedures to ensure maximum possible accuracy of consumer reports.";
  
  if (ctx.statuteSection || ctx.statuteDescription) {
    statutoryGrounds = `This dispute is based on ${ctx.statuteSection || "the Consumer Reporting Act"}.`;
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
    subject: "Re: Formal Dispute of Consumer Report Information under Prince Edward Island Consumer Reporting Act, R.S.P.E.I. 1988, c. C-26",
    introduction: "I am writing to formally dispute information contained in my consumer report maintained by your agency. This dispute is submitted pursuant to the Prince Edward Island Consumer Reporting Act, R.S.P.E.I. 1988, c. C-26, and I request that you conduct a reasonable investigation as required by statute.",
    accountIdentification: formatAccountIdentification(ctx),
    disputedItems: formatDisputedItems(ctx.disputedItems),
    statutoryGrounds,
    supportingDocumentation: "Relevant documentation supporting this dispute is enclosed. Please review these materials as part of your statutory investigation.",
    requestedAction: "I request that you:\n1. Conduct a reasonable investigation of the disputed information as required by Section 12 of the Act;\n2. Correct or delete any information found to be inaccurate or unverifiable;\n3. Provide me with written confirmation of the results of your investigation;\n4. Notify all parties to whom the report was provided in the past six months of any corrections or deletions.",
    statutoryTimeframe: "Under Prince Edward Island law, you are required to complete your investigation within a reasonable time. I expect a response within 30 days of receipt of this letter.",
    consumerStatementRight: "Should the investigation not resolve this matter to my satisfaction, I reserve my right under Section 9 of the Act to have a consumer statement included in my file.",
    deliveryConfirmation: `This letter is being sent via ${deliveryInstructions.serviceName} to establish proof of delivery.`,
    certification: "I certify under penalty of law that the information provided in this letter is true and accurate to the best of my knowledge.",
    closing: "Sincerely,",
    statutoryReference: ctx.statuteSection 
      ? `Reference: ${ctx.statuteSection}`
      : "Reference: Consumer Reporting Act, R.S.P.E.I. 1988, c. C-26, Sections 9, 12",
    sourceUrl: ctx.statuteSourceUrl || "https://www.princeedwardisland.ca/en/legislation/consumer-reporting-act",
    trackingPlaceholder,
    deliveryInstructions: `${deliveryInstructions.serviceName} - ${deliveryInstructions.warning}`,
  };
  
  return applyTemplateOverrides(content, "provincial", "pei_cra");
}