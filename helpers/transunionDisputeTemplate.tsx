import {
  EquifaxDisputeReasonCode,
  getDisputeReasonDescription,
  type StatuteInfo,
} from "./equifaxDisputeReasons";
import type { TradelineDetails, ViolationDetails } from "./equifaxDisputeTemplate";
import { buildBureauRequestedAction } from "./equifaxDisputeTemplate";
import { disputeNarrativeBuilder, getDisputeLetterFraming, buildViolationAwareAccountId } from "./disputeNarrativeBuilder";
import { deduplicateLetterSections } from "./disputeNarrativeFraming";
import {
  applyEvidentiaryDisputeStructure,
  buildViolationNarrativeTemplateVariables,
  describeDisputedFields,
  type ConsumerFileReference,
} from "./disputeLetterStructure";
import type { LetterContent } from "./pdfGenerator";
import { applyTemplateOverrides } from "./letterTemplateQueries";
import { buildSpecificStatutoryGrounds } from "./disputeLetterStatutoryGrounds";

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
  transunionCaseId?: string;
  transunionFileNumber?: string;
  additionalNotes?: string;

  // Rich data for evidence-backed letters
  tradelineDetails?: TradelineDetails;
  violationDetails?: ViolationDetails;

  // Specific statute information from the database for this consumer's province
  statuteInfo?: StatuteInfo;
  consumerFileReference?: ConsumerFileReference;
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
    ctx.tradelineDetails,
    ctx.statuteInfo?.sectionReference || ctx.statuteInfo?.code || ctx.violationDetails?.statutoryBasis
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
  const statutoryGrounds = buildSpecificStatutoryGrounds({
    disputeReasonCode: ctx.disputeReasonCode,
    province,
    statuteInfo: ctx.statuteInfo,
    violationCategory: ctx.violationDetails?.violationCategory ?? ctx.violationCategory,
    violationDetails: ctx.violationDetails,
    tradelineDetails: ctx.tradelineDetails,
  });

  // Generate bureau-directed requestedAction
  let requestedAction = await buildBureauRequestedAction(
    ctx.violationDetails?.violationCategory ?? ctx.violationCategory,
    ctx.tradelineDetails,
    ctx.violationDetails,
    ctx.statuteInfo?.sectionReference || ctx.statuteInfo?.code || ctx.violationDetails?.statutoryBasis
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
    consumerFileReference: ctx.consumerFileReference,
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
    templateVariables: {
      ...buildViolationNarrativeTemplateVariables({
        violationCategory: ctx.violationDetails?.violationCategory ?? ctx.violationCategory,
        bureauName: "TransUnion of Canada, Inc.",
        violationDetails: ctx.violationDetails,
        tradelineDetails: ctx.tradelineDetails,
        statutoryReference:
          ctx.statuteInfo?.sectionReference || ctx.statuteInfo?.code || ctx.violationDetails?.statutoryBasis,
      }),
      bureauName: "TransUnion of Canada, Inc.",
      creditorName: ctx.creditorName,
      accountNumber: ctx.accountNumber,
      exactDisputedFields: describeDisputedFields(
        ctx.violationDetails?.violationCategory ?? ctx.violationCategory,
        ctx.violationDetails
      ),
      creditReportReferenceNumber: ctx.consumerFileReference?.creditReportReferenceNumber,
      reportDate: ctx.consumerFileReference?.reportDate,
      province,
      statutoryReference: ctx.statuteInfo?.sectionReference || ctx.statuteInfo?.code,
    },
  };

  if (ctx.transunionCaseId) {
    letterContent.supportingDocumentation = `TransUnion Case ID: ${ctx.transunionCaseId}`;
  } else if (ctx.transunionFileNumber) {
    letterContent.supportingDocumentation = `TransUnion File Number: ${ctx.transunionFileNumber}`;
  }

  const overridden = await applyTemplateOverrides(letterContent, "bureau", "transunion");
  return applyEvidentiaryDisputeStructure(overridden, {
    violationCategory: ctx.violationDetails?.violationCategory ?? ctx.violationCategory,
    violationDetails: ctx.violationDetails,
    tradelineDetails: ctx.tradelineDetails,
    consumerFileReference: ctx.consumerFileReference,
  });
}
