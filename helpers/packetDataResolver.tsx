import { db } from "./db";
import { BusinessRuleError } from "./endpointErrorHandler";
import { calculateTerminalLabel, type TerminalLabelPhase } from "./terminalLabelProgression";
import type { TradelineDetails, ViolationDetails } from "./equifaxDisputeTemplate";

export interface PacketDataResolverParams {
  user: {
    id: number;
    email: string;
    role?: string | null;
  };
  tradelineId?: number | null;
  bureauId?: number | null;
  creditorObligationTestId?: number | null;
  isAdmin: boolean;
  // Optional third-party recipient override — if all required fields are provided,
  // these will be used instead of the bureau lookup for recipient name/address.
  thirdPartyRecipient?: {
    recipientName?: string;
    recipientAddressLine1?: string;
    recipientAddressLine2?: string;
    recipientCity?: string;
    recipientProvince?: string;
    recipientPostalCode?: string;
  };
}

export interface PacketDataResolverResult {
  accountNumber?: string;
  creditorName?: string;
  terminalLabel: TerminalLabelPhase | null;
  tradelineDetails?: TradelineDetails;
  violationDetails?: ViolationDetails;
  recipientName: string;
  recipientAddress: string[];
  bureauNameRaw: string | null;
}

function isThirdPartyRecipientComplete(
  tp: PacketDataResolverParams["thirdPartyRecipient"]
): tp is {
  recipientName: string;
  recipientAddressLine1: string;
  recipientCity: string;
  recipientProvince: string;
  recipientPostalCode: string;
  recipientAddressLine2?: string;
} {
  return (
    !!tp &&
    !!tp.recipientName?.trim() &&
    !!tp.recipientAddressLine1?.trim() &&
    !!tp.recipientCity?.trim() &&
    !!tp.recipientProvince?.trim() &&
    !!tp.recipientPostalCode?.trim()
  );
}

export async function packetDataResolver(
  params: PacketDataResolverParams
): Promise<PacketDataResolverResult> {
  let accountNumber: string | undefined;
  let creditorName: string | undefined;
  let terminalLabel: TerminalLabelPhase | null = null;
  let tradelineDetails: TradelineDetails | undefined;

  // 1. Fetch full tradeline data if provided
  if (params.tradelineId) {
    let tradelineQuery = db
      .selectFrom("tradeline")
      .leftJoin("creditor", "creditor.id", "tradeline.creditorId")
      .select([
        "tradeline.accountNumber",
        "tradeline.originalCreditorName",
        "creditor.name as creditorName",
        "tradeline.balance",
        "tradeline.creditLimit",
        "tradeline.currentBalance",
        "tradeline.status",
        "tradeline.accountType",
        "tradeline.openedDate",
        "tradeline.dateClosed",
        "tradeline.dateOfFirstDelinquency",
        "tradeline.dateOfLastPayment",
        "tradeline.amountPastDue",
        "tradeline.paymentPattern",
        "tradeline.highCredit",
        "tradeline.terms",
        "tradeline.ecoaCode",
        "tradeline.responsibilityCode",
        "tradeline.lastActivityDate",
        "tradeline.isCollectionAccount",
        "tradeline.collectionAgencyName",
      ])
      .where("tradeline.id", "=", params.tradelineId);

    if (!params.isAdmin) {
      tradelineQuery = tradelineQuery.where("tradeline.userId", "=", params.user.id);
    }

    const tradeline = await tradelineQuery.executeTakeFirst();

    if (!tradeline && !params.isAdmin) {
      throw new BusinessRuleError("You do not have access to this tradeline.", 403);
    }

    if (tradeline) {
      const resolvedCreditorName =
        tradeline.creditorName && tradeline.creditorName.trim()
          ? tradeline.creditorName.trim()
          : tradeline.originalCreditorName && tradeline.originalCreditorName.trim()
            ? tradeline.originalCreditorName.trim()
            : null;

      accountNumber = tradeline.accountNumber?.trim() || undefined;
      creditorName = resolvedCreditorName ?? undefined;

      tradelineDetails = {
        balance: tradeline.balance != null ? String(tradeline.balance) : null,
        creditLimit: tradeline.creditLimit != null ? String(tradeline.creditLimit) : null,
        currentBalance: tradeline.currentBalance != null ? String(tradeline.currentBalance) : null,
        status: tradeline.status,
        accountType: tradeline.accountType,
        openedDate: tradeline.openedDate ? new Date(tradeline.openedDate) : null,
        dateClosed: tradeline.dateClosed ? new Date(tradeline.dateClosed) : null,
        dateOfFirstDelinquency: tradeline.dateOfFirstDelinquency
          ? new Date(tradeline.dateOfFirstDelinquency)
          : null,
        dateOfLastPayment: tradeline.dateOfLastPayment ? new Date(tradeline.dateOfLastPayment) : null,
        amountPastDue: tradeline.amountPastDue != null ? String(tradeline.amountPastDue) : null,
        paymentPattern: tradeline.paymentPattern,
        highCredit: tradeline.highCredit != null ? String(tradeline.highCredit) : null,
        terms: tradeline.terms,
        ecoaCode: tradeline.ecoaCode,
        responsibilityCode: tradeline.responsibilityCode,
        lastActivityDate: tradeline.lastActivityDate ? new Date(tradeline.lastActivityDate) : null,
        isCollectionAccount: tradeline.isCollectionAccount,
        collectionAgencyName: tradeline.collectionAgencyName,
      };

      console.log(
        `Fetched full tradeline details for ID ${params.tradelineId}: creditorName=${tradeline.creditorName}, originalCreditorName=${tradeline.originalCreditorName}, resolvedCreditorName=${resolvedCreditorName}, status=${tradeline.status}, balance=${tradeline.balance}, isCollection=${tradeline.isCollectionAccount}`
      );
    }

    // Calculate terminal label based on obligation instances
    const obligationInstances = await db
      .selectFrom("obligationInstance")
      .select(["id", "state"])
      .where("tradelineId", "=", params.tradelineId)
      .execute();

    terminalLabel = calculateTerminalLabel(obligationInstances);
    console.log(
      `Terminal label calculated: ${terminalLabel} (based on ${obligationInstances.length} instance(s))`
    );
  }

  // 2. Fetch creditorObligationTest data if provided
  let violationDetails: ViolationDetails | undefined;

  if (params.creditorObligationTestId) {
    const obligationTest = await db
      .selectFrom("creditorObligationTest")
      .select([
        "violationCategory",
        "detectedAt",
        "disputeVector",
        "obligationType",
        "severity",
        "statutoryBasis",
        "notes",
        "omissions",
        "userExplanation",
        "recommendedAction",
        "technicalDetails",
      ])
      .where("id", "=", params.creditorObligationTestId)
      .executeTakeFirst();

    if (obligationTest) {
      const techDetails = obligationTest.technicalDetails as Record<string, unknown> | null;
      const detectedValue =
        (techDetails?.detectedValue ?? techDetails?.actualValue) != null
          ? String(techDetails?.detectedValue ?? techDetails?.actualValue)
          : undefined;
      const expectedValue =
        techDetails?.expectedValue != null ? String(techDetails.expectedValue) : undefined;
      const fieldName = techDetails?.fieldName != null ? String(techDetails.fieldName) : undefined;
      
      const duplicateTradelineId = techDetails?.duplicateTradelineId != null ? Number(techDetails.duplicateTradelineId) : undefined;
      const otherAgencyName = techDetails?.otherAgencyName != null ? String(techDetails.otherAgencyName) : undefined;
      const otherBalance = techDetails?.otherBalance != null ? String(techDetails.otherBalance) : undefined;
      const otherDateAssigned = techDetails?.otherDateAssigned != null ? String(techDetails.otherDateAssigned) : undefined;
      const originalCreditorName = techDetails?.originalCreditorName != null ? String(techDetails.originalCreditorName) : undefined;
      const matchReason = techDetails?.matchReason != null ? String(techDetails.matchReason) : undefined;
      const assignmentDocsFound = techDetails?.assignmentDocsFound != null ? Number(techDetails.assignmentDocsFound) : undefined;
      const validationReceived = techDetails?.validationReceived != null ? Boolean(techDetails.validationReceived) : undefined;
      const daysElapsed = techDetails?.daysElapsed != null ? Number(techDetails.daysElapsed) : undefined;

      let duplicateCreditorName: string | undefined;
      let duplicateAccountNumber: string | undefined;

      if (duplicateTradelineId) {
        let dupQuery = db
          .selectFrom("tradeline")
          .leftJoin("creditor", "creditor.id", "tradeline.creditorId")
          .select([
            "tradeline.accountNumber",
            "tradeline.originalCreditorName",
            "creditor.name as creditorName"
          ])
          .where("tradeline.id", "=", duplicateTradelineId);

        if (!params.isAdmin) {
          dupQuery = dupQuery.where("tradeline.userId", "=", params.user.id);
        }

        const dupTradeline = await dupQuery.executeTakeFirst();
        if (dupTradeline) {
          duplicateAccountNumber = dupTradeline.accountNumber?.trim() || undefined;
          duplicateCreditorName = (dupTradeline.creditorName?.trim() || dupTradeline.originalCreditorName?.trim()) || undefined;
        }
      }

      violationDetails = {
        violationCategory: obligationTest.violationCategory ?? undefined,
        detectedValue,
        expectedValue,
        fieldName,
        userExplanation: obligationTest.userExplanation ?? undefined,
        recommendedAction: obligationTest.recommendedAction ?? undefined,
        disputeVector: obligationTest.disputeVector ?? undefined,
        obligationType: obligationTest.obligationType ?? undefined,
        severity: obligationTest.severity ?? undefined,
        statutoryBasis: obligationTest.statutoryBasis ?? undefined,
        notes: obligationTest.notes ?? undefined,
        omissions: obligationTest.omissions ?? undefined,
        duplicateTradelineId,
        otherAgencyName,
        otherBalance,
        otherDateAssigned,
        duplicateCreditorName,
        duplicateAccountNumber,
        originalCreditorName,
        matchReason,
        assignmentDocsFound,
        validationReceived,
        daysElapsed,
      };

      console.log(
        `Fetched violation details for obligation test ID ${params.creditorObligationTestId}: category=${obligationTest.violationCategory}, severity=${obligationTest.severity}`
      );
    }
  }

  // 3. Resolve recipient name and address.
  // Priority: third-party recipient fields (if complete) > bureau lookup.
  // Bureau lookup is still performed if bureauId is provided to get bureauNameRaw.
  let recipientName = "Credit Bureau";
  let recipientAddress: string[] = ["Address Not Available"];
  let bureauNameRaw: string | null = null;

  // Always fetch bureau name for context even when third-party recipient is provided
  if (params.bureauId) {
    const bureau = await db
      .selectFrom("bureau")
      .select(["name", "address"])
      .where("id", "=", params.bureauId)
      .executeTakeFirst();

    if (bureau) {
      bureauNameRaw = bureau.name || null;
      // Only use bureau address/name if no third-party recipient override
      if (!isThirdPartyRecipientComplete(params.thirdPartyRecipient)) {
        recipientName = bureau.name || "Credit Bureau";
        if (bureau.address) {
          const addressLines = bureau.address.split("\n").filter((line) => line.trim());
          recipientAddress = addressLines.length > 0 ? addressLines : ["Address Not Available"];
        }
      }
    }
  }

  // Apply third-party recipient override if all required fields are present
  if (isThirdPartyRecipientComplete(params.thirdPartyRecipient)) {
    const tp = params.thirdPartyRecipient;
    recipientName = tp.recipientName.trim();
    recipientAddress = [tp.recipientAddressLine1.trim()];
    if (tp.recipientAddressLine2?.trim()) {
      recipientAddress.push(tp.recipientAddressLine2.trim());
    }
    recipientAddress.push(
      `${tp.recipientCity.trim()}, ${tp.recipientProvince.trim()} ${tp.recipientPostalCode.trim()}`
    );
    console.log(
      `Using third-party recipient override: name="${recipientName}", address=${JSON.stringify(recipientAddress)}`
    );
  }

  return {
    accountNumber,
    creditorName,
    terminalLabel,
    tradelineDetails,
    violationDetails,
    recipientName,
    recipientAddress,
    bureauNameRaw,
  };
}