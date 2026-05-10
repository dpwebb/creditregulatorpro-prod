import type { LetterContent } from "./pdfGenerator";
import {
  generateTrackingPlaceholder,
  getCertifiedMailInstructions,
  getRegisteredMailInstructions,
} from "./trackingPlaceholders";
import type { TemplateContext } from "./packetTemplatesCA";
import { finalizeProvincialLetter, formatDisputedItems, formatAccountIdentification } from "./packetTemplatesCA";

/**
 * Quebec Credit Agents Act dispute template
 */
export async function quebecCreditAgents(ctx: TemplateContext): Promise<LetterContent> {
  const trackingPlaceholder = generateTrackingPlaceholder();
  const deliveryInstructions = getRegisteredMailInstructions("QC");
  
  const letterDate = new Date().toLocaleDateString("fr-CA");
  
  let statutoryGrounds = "En vertu de l'article 12 de la Loi, vous êtes tenu de prendre des mesures raisonnables pour assurer l'exactitude maximale des dossiers de crédit.";
  
  if (ctx.statuteSection || ctx.statuteDescription) {
    statutoryGrounds = `Cette contestation est fondée sur ${ctx.statuteSection || "la Loi sur les renseignements personnels dans le secteur privé"}.`;
    if (ctx.statuteDescription) {
      statutoryGrounds += ` ${ctx.statuteDescription}`;
    }
    statutoryGrounds += " J'affirme que les éléments contestés ne répondent pas à cette norme légale et je demande une enquête immédiate.";
  } else {
    statutoryGrounds += " J'affirme que les éléments contestés ne répondent pas à cette norme légale et je demande une enquête immédiate.";
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
    subject: "Re: Contestation formelle d'information de dossier de crédit en vertu de la Loi sur les renseignements personnels dans le secteur privé, RLRQ c. A-8.2",
    introduction: "Je vous écris pour contester formellement les renseignements contenus dans mon dossier de crédit tenu par votre agence. Cette contestation est soumise en vertu de la Loi sur les renseignements personnels dans le secteur privé, RLRQ c. A-8.2, et je demande que vous procédiez à une enquête raisonnable comme l'exige la loi.",
    accountIdentification: formatAccountIdentification(ctx),
    disputedItems: formatDisputedItems(ctx.disputedItems),
    statutoryGrounds,
    supportingDocumentation: "Les documents pertinents appuyant cette contestation sont joints. Veuillez examiner ces documents dans le cadre de votre enquête statutaire.",
    requestedAction: "Je demande que vous:\n1. Procédiez à une enquête raisonnable sur les renseignements contestés conformément à l'article 12 de la Loi;\n2. Corrigiez ou supprimiez tout renseignement inexact ou invérifiable;\n3. Me fournissiez une confirmation écrite des résultats de votre enquête;\n4. Notifiez toutes les parties à qui le rapport a été fourni au cours des six derniers mois de toute correction ou suppression.",
    statutoryTimeframe: "En vertu de la loi québécoise, vous êtes tenu de compléter votre enquête dans un délai raisonnable. Je m'attends à une réponse dans les 30 jours suivant la réception de cette lettre.",
    consumerStatementRight: "Si l'enquête ne résout pas cette affaire à ma satisfaction, je me réserve le droit en vertu de la Loi de faire inclure une déclaration du consommateur dans mon dossier.",
    deliveryConfirmation: `Cette lettre est envoyée par ${deliveryInstructions.serviceName} pour établir une preuve de livraison.`,
    certification: "Je certifie sous peine de sanctions légales que les renseignements fournis dans cette lettre sont véridiques et exacts au meilleur de ma connaissance.",
    closing: "Cordialement,",
    statutoryReference: ctx.statuteSection 
      ? `Référence: ${ctx.statuteSection}`
      : "Référence: Loi sur les renseignements personnels dans le secteur privé, RLRQ c. A-8.2, article 12",
    sourceUrl: ctx.statuteSourceUrl || "https://www.legisquebec.gouv.qc.ca/fr/document/lc/R-2.2",
    trackingPlaceholder,
    deliveryInstructions: `${deliveryInstructions.serviceName} - ${deliveryInstructions.warning}`,
  };
  
  return finalizeProvincialLetter(content, "quebec_a82", ctx);
}

/**
 * Alberta Personal Information Protection Act (PIPA) dispute template
 */
export async function albertaPIPA(ctx: TemplateContext): Promise<LetterContent> {
  const trackingPlaceholder = generateTrackingPlaceholder();
  const deliveryInstructions = getCertifiedMailInstructions("AB");
  
  const letterDate = new Date().toLocaleDateString("en-CA");
  
  let statutoryGrounds = "Under Section 24 of PIPA, you are required to correct personal information that is demonstrated to be inaccurate or incomplete.";
  
  if (ctx.statuteSection || ctx.statuteDescription) {
    statutoryGrounds = `This dispute is based on ${ctx.statuteSection || "the Personal Information Protection Act"}.`;
    if (ctx.statuteDescription) {
      statutoryGrounds += ` ${ctx.statuteDescription}`;
    }
    statutoryGrounds += " I assert that the disputed items are inaccurate and request immediate correction or deletion.";
  } else {
    statutoryGrounds += " I assert that the disputed items are inaccurate and request immediate correction or deletion.";
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
    subject: "Re: Formal Dispute of Personal Information under Alberta Personal Information Protection Act, S.A. 2003, c. P-6.5",
    introduction: "I am writing to formally dispute personal information contained in my consumer report maintained by your organization. This dispute is submitted pursuant to the Alberta Personal Information Protection Act (PIPA), S.A. 2003, c. P-6.5, and I request correction of inaccurate information as provided by statute.",
    accountIdentification: formatAccountIdentification(ctx),
    disputedItems: formatDisputedItems(ctx.disputedItems),
    statutoryGrounds,
    supportingDocumentation: "Relevant documentation supporting this dispute is enclosed. Please review these materials in accordance with your statutory obligations under PIPA.",
    requestedAction: "I request that you:\n1. Correct or delete the disputed information as required by Section 24 of PIPA;\n2. Provide me with written confirmation of the corrections made;\n3. Notify all third parties to whom the inaccurate information was disclosed of the corrections;\n4. Ensure that corrected information is used in all future reports.",
    statutoryTimeframe: "Under PIPA, you must respond to correction requests within a reasonable time. I expect a response within 30 days of receipt of this letter.",
    consumerStatementRight: "If you do not agree to make the requested corrections, I reserve my right under Section 24(3) of PIPA to require that a statement of disagreement be attached to the information.",
    deliveryConfirmation: `This letter is being sent via ${deliveryInstructions.serviceName} to establish proof of delivery.`,
    certification: "I certify that the information provided in this letter is true and accurate to the best of my knowledge.",
    closing: "Sincerely,",
    statutoryReference: ctx.statuteSection 
      ? `Reference: ${ctx.statuteSection}`
      : "Reference: Personal Information Protection Act, S.A. 2003, c. P-6.5, Section 24",
    sourceUrl: ctx.statuteSourceUrl || "https://www.alberta.ca/pipa.aspx",
    trackingPlaceholder,
    deliveryInstructions: `${deliveryInstructions.serviceName} - ${deliveryInstructions.warning}`,
  };
  
  return finalizeProvincialLetter(content, "alberta_pipa", ctx);
}
