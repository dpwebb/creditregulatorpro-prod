import {
  EquifaxDisputeReasonCode,
  getDisputeReasonDescription,
  getDisputeReasonStatutoryBasis,
  type StatuteInfo,
} from "./equifaxDisputeReasons";
import type { TradelineDetails, ViolationDetails } from "./equifaxDisputeTemplate";
import { buildBureauRequestedAction } from "./equifaxDisputeTemplate";
import { disputeNarrativeBuilder, getDisputeLetterFraming, buildViolationAwareAccountId } from "./disputeNarrativeBuilder";
import { deduplicateLetterSections } from "./disputeNarrativeFraming";
import type { LetterContent } from "./pdfGenerator";
import { applyTemplateOverrides } from "./letterTemplateQueries";

/**
 * Extended context for building TransUnion-specific disputes.
 * Reuses the EquifaxDisputeReasonCode as the underlying dispute reasons are standard across bureaus.
 */
export interface TransUnionDisputeContext {
  // Consumer Info
  consumerName: string;
  consumerAddress: string[];
  consumerDOB?: string;
  consumerPhone?: string;
  consumerEmail?: string;

  // Account Info
  creditorName: string; // Maps to "Furnisher Name" in the letter
  accountNumber: string;

  // Dispute Details
  violationId?: number;
  violationCategory?: string;
  disputeReasonCode: EquifaxDisputeReasonCode;

  // Optional specifics for the dispute body
  expectedCorrectValue?: string;
  transunionFileNumber?: string;
  additionalNotes?: string;

  // Rich data for evidence-backed letters
  tradelineDetails?: TradelineDetails;
  violationDetails?: ViolationDetails;

  // Specific statute information from the database for this consumer's province
  statuteInfo?: StatuteInfo;
}

/**
 * Builds the TransUnion dispute letter using the official TransUnion Canada template format.
 */
export async function buildTransUnionDispute(ctx: TransUnionDisputeContext, province?: string): Promise<LetterContent> {
  const currentDate = new Date().toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Hardcoded official TransUnion Canada Consumer Relations address
  const recipientAddress = [
    "Consumer Relations",
    "P.O. Box 338",
    "LCD 1",
    "Hamilton, ON L8L 7W2",
  ];

  const reasonDescription = getDisputeReasonDescription(ctx.disputeReasonCode);

  // Use violation-aware framing for subject and introduction
  const framing = await getDisputeLetterFraming(
    ctx.violationDetails?.violationCategory ?? ctx.violationCategory,
    "TransUnion",
    ctx.violationDetails,
    ctx.tradelineDetails
  );

  // Build violation-aware account identification
  const accountIdentification = buildViolationAwareAccountId(
    ctx.creditorName,
    ctx.accountNumber,
    ctx.violationDetails?.violationCategory ?? ctx.violationCategory,
    ctx.tradelineDetails,
    "Furnisher Name",
    ctx.violationDetails
  );

  // Build plain-language basis of dispute
  const basisOfDisputeParagraphs = disputeNarrativeBuilder({
    violationCategory: ctx.violationDetails?.violationCategory ?? ctx.violationCategory,
    tradelineDetails: ctx.tradelineDetails,
    violationDetails: ctx.violationDetails,
    reasonDescription,
    additionalNotes: ctx.additionalNotes,
    expectedCorrectValue: ctx.expectedCorrectValue,
  });
  let basisOfDisputeText = basisOfDisputeParagraphs.join("\n\n");

  const disputedItemsText = basisOfDisputeText;

  const introduction = deduplicateLetterSections(framing.introduction, disputedItemsText);

  // Build statutory grounds — single location, no duplication in disputedItems
  let statutoryGrounds: string;
  if (province) {
    const statutoryBasis = getDisputeReasonStatutoryBasis(
      ctx.disputeReasonCode,
      province,
      ctx.statuteInfo
    );
    statutoryGrounds = statutoryBasis;
  } else if (ctx.violationDetails?.statutoryBasis) {
    statutoryGrounds = `This dispute is filed pursuant to ${ctx.violationDetails.statutoryBasis}.`;
  } else if (ctx.statuteInfo) {
    statutoryGrounds = `This dispute is filed pursuant to ${ctx.statuteInfo.code} ${ctx.statuteInfo.sectionReference}.`;
  } else {
    statutoryGrounds = "This dispute is filed pursuant to applicable consumer reporting legislation.";
  }

  // Generate bureau-directed requestedAction
  let requestedAction = await buildBureauRequestedAction(
    ctx.violationDetails?.violationCategory ?? ctx.violationCategory,
    ctx.tradelineDetails,
    ctx.violationDetails
  );
  requestedAction += " You have 30 days to complete this.";

  const certification =
    "I certify that the information provided in this letter is true and accurate to the best of my knowledge.";
  const closing = "Regards,";

  const letterContent: LetterContent = {
    consumerName: ctx.consumerName,
    consumerAddress: ctx.consumerAddress,
    consumerDOB: ctx.consumerDOB,
    consumerPhone: ctx.consumerPhone,
    consumerEmail: ctx.consumerEmail,
    letterDate: currentDate,

    recipientName: "TransUnion of Canada, Inc.",
    recipientAddress,

    subject: framing.subject,

    introduction,
    accountIdentification,
    disputedItems: disputedItemsText,
    statutoryGrounds,
    requestedAction,
    statutoryTimeframe: undefined,
    certification,
    closing,
  };

  if (ctx.transunionFileNumber) {
    letterContent.supportingDocumentation = `TransUnion File Number: ${ctx.transunionFileNumber}`;
  }

  return applyTemplateOverrides(letterContent, "bureau", "transunion");
}
