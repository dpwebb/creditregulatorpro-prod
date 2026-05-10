import type { LetterContent } from "./pdfGenerator";
import type { TerminalLabelPhase } from "./terminalLabelProgression";
import {
  buildEquifaxDispute,
  buildBureauRequestedAction,
  checkDofdSolObstruction,
  type EquifaxDisputeContext,
  type TradelineDetails,
  type ViolationDetails,
} from "./equifaxDisputeTemplate";
import {
  disputeNarrativeBuilder,
  getDisputeLetterFraming,
  buildViolationAwareAccountId,
} from "./disputeNarrativeBuilder";
import { buildTransUnionDispute, type TransUnionDisputeContext } from "./transunionDisputeTemplate";
import {
  type EquifaxDisputeReasonCode,
  type StatuteInfo,
} from "./equifaxDisputeReasons";
import { applyTemplateOverrides } from "./letterTemplateQueries";
import { deduplicateLetterSections } from "./disputeNarrativeFraming";
import { buildSpecificStatutoryGrounds } from "./disputeLetterStatutoryGrounds";

export interface PacketLetterBuilderParams {
  bureauNameRaw: string | null;
  consumerName: string;
  consumerAddress: string[];
  consumerDOB?: string;
  consumerPhone?: string;
  consumerEmail?: string;
  creditorName?: string;
  accountNumber?: string;
  transunionCaseId?: string;
  tradelineDetails?: TradelineDetails;
  violationDetails?: ViolationDetails;
  effectiveViolationCategory: string | null;
  disputeReasonCode: EquifaxDisputeReasonCode;
  statuteInfo?: StatuteInfo;
  terminalLabel: TerminalLabelPhase | null;
  province: string;
  additionalNotes?: string;
  recipientName: string;
  recipientAddress: string[];
}

export async function packetLetterBuilder(params: PacketLetterBuilderParams): Promise<LetterContent> {
  let letterContent: LetterContent;

  const bureauNameNormalized = (params.bureauNameRaw ?? "").toLowerCase();

  const UNKNOWN_CREDITOR = "Not identified in consumer disclosure";
  const UNKNOWN_ACCOUNT = "Not reported by bureau";

  const displayCreditorName =
    params.creditorName && params.creditorName.trim()
      ? params.creditorName.trim()
      : UNKNOWN_CREDITOR;

  const displayAccountNumber =
    params.accountNumber && params.accountNumber.trim()
      ? params.accountNumber.trim()
      : UNKNOWN_ACCOUNT;

  if (bureauNameNormalized.includes("equifax")) {
    console.log(
      `Bureau "${params.bureauNameRaw}" identified as Equifax — using Equifax bureau-specific dispute template`
    );
    const equifaxCtx: EquifaxDisputeContext = {
      consumerName: params.consumerName,
      consumerAddress: params.consumerAddress,
      consumerDOB: params.consumerDOB,
      consumerPhone: params.consumerPhone,
      consumerEmail: params.consumerEmail,
      creditorName: displayCreditorName,
      accountNumber: displayAccountNumber,
      disputeReasonCode: params.disputeReasonCode,
      additionalNotes: params.additionalNotes,
      tradelineDetails: params.tradelineDetails,
      violationDetails: params.violationDetails,
      statuteInfo: params.statuteInfo,
    };
    // Override is applied inside buildEquifaxDispute
    letterContent = await buildEquifaxDispute(equifaxCtx, params.province);
  } else if (
    bureauNameNormalized.includes("transunion") ||
    bureauNameNormalized.includes("trans union")
  ) {
    console.log(
      `Bureau "${params.bureauNameRaw}" identified as TransUnion — using TransUnion bureau-specific dispute template`
    );
    const transunionCtx: TransUnionDisputeContext = {
      consumerName: params.consumerName,
      consumerAddress: params.consumerAddress,
      consumerDOB: params.consumerDOB,
      consumerPhone: params.consumerPhone,
      consumerEmail: params.consumerEmail,
      creditorName: displayCreditorName,
      accountNumber: displayAccountNumber,
      transunionCaseId: params.transunionCaseId,
      disputeReasonCode: params.disputeReasonCode,
      additionalNotes: params.additionalNotes,
      tradelineDetails: params.tradelineDetails,
      violationDetails: params.violationDetails,
      statuteInfo: params.statuteInfo,
    };
    // Override is applied inside buildTransUnionDispute
    letterContent = await buildTransUnionDispute(transunionCtx, params.province);
  } else {
    console.log(
      `No bureau-specific template matched for "${
        params.bureauNameRaw ?? "unknown"
      }" — using generic letter with enriched content`
    );

    const letterDate = new Date().toLocaleDateString("en-CA");

    const framing = await getDisputeLetterFraming(
      params.effectiveViolationCategory,
      undefined,
      params.violationDetails,
      params.tradelineDetails
    );

    const accountIdentification = buildViolationAwareAccountId(
      displayCreditorName,
      displayAccountNumber,
      params.effectiveViolationCategory,
      params.tradelineDetails,
      "Creditor/Furnisher",
      params.violationDetails
    );

    const disputeLines = disputeNarrativeBuilder({
      violationCategory: params.effectiveViolationCategory ?? undefined,
      tradelineDetails: params.tradelineDetails,
      violationDetails: params.violationDetails,
      reasonDescription: "The information reported for this account is inaccurate",
      additionalNotes: params.additionalNotes,
    });

    const statutoryGrounds = buildSpecificStatutoryGrounds({
      disputeReasonCode: params.disputeReasonCode,
      province: params.province,
      statuteInfo: params.statuteInfo,
      violationCategory: params.effectiveViolationCategory,
      violationDetails: params.violationDetails,
      tradelineDetails: params.tradelineDetails,
    });

    let requestedAction = await buildBureauRequestedAction(
      params.effectiveViolationCategory,
      params.tradelineDetails,
      params.violationDetails
    );
    requestedAction += " You have 30 days to complete this.";

    const disputedItemsText = disputeLines.join("\n\n");
    const cleanedIntro = deduplicateLetterSections(framing.introduction, disputedItemsText);

    letterContent = {
      consumerName: params.consumerName,
      consumerAddress: params.consumerAddress,
      consumerDOB: params.consumerDOB,
      consumerPhone: params.consumerPhone,
      consumerEmail: params.consumerEmail,
      letterDate,
      recipientName: params.recipientName,
      recipientAddress: params.recipientAddress,
      subject: checkDofdSolObstruction(
        params.effectiveViolationCategory,
        params.violationDetails,
        params.tradelineDetails
      )
        ? framing.subject
        : params.terminalLabel || framing.subject,
      introduction: cleanedIntro,
      accountIdentification,
      disputedItems: disputedItemsText,
      statutoryGrounds,
      requestedAction,
      statutoryTimeframe: undefined,
      certification:
        "I certify that the information provided in this letter is true and accurate to the best of my knowledge.",
      closing: "Sincerely,",
      templateVariables: {
        bureauName: params.recipientName,
        creditorName: displayCreditorName,
        accountNumber: displayAccountNumber,
        province: params.province,
        statutoryReference: params.statuteInfo?.sectionReference || params.statuteInfo?.code,
      },
    };

    // Apply generic bureau overrides
    letterContent = await applyTemplateOverrides(letterContent, "bureau", "generic");
  }

  letterContent.statutoryGrounds = buildSpecificStatutoryGrounds({
    disputeReasonCode: params.disputeReasonCode,
    province: params.province,
    statuteInfo: params.statuteInfo,
    violationCategory: params.effectiveViolationCategory,
    violationDetails: params.violationDetails,
    tradelineDetails: params.tradelineDetails,
    existingGrounds: letterContent.statutoryGrounds,
  });

  return letterContent;
}
