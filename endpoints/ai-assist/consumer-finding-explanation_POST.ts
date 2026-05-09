import { db } from "../../helpers/db";
import {
  BusinessRuleError,
  handleEndpointError,
} from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { generateConsumerFindingExplanation } from "../../helpers/consumerExplanationAssist";
import { schema, OutputType } from "./consumer-finding-explanation_POST.schema";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    const row = await db
      .selectFrom("creditorObligationTest")
      .leftJoin("tradeline", "tradeline.id", "creditorObligationTest.tradelineId")
      .leftJoin("creditor", "creditor.id", "creditorObligationTest.creditorId")
      .leftJoin("creditor as tradelineCreditor", "tradelineCreditor.id", "tradeline.creditorId")
      .leftJoin("bureau", "bureau.id", "tradeline.bureauId")
      .select([
        "creditorObligationTest.id",
        "creditorObligationTest.violationCategory",
        "creditorObligationTest.technicalDetails",
        "creditorObligationTest.userExplanation",
        "creditorObligationTest.recommendedAction",
        "tradeline.userId as tradelineUserId",
        "tradeline.accountNumber as accountNumber",
        "tradeline.accountType as accountType",
        "tradeline.collectionAgencyName as collectionAgencyName",
        "tradeline.originalCreditorName as originalCreditorName",
        "tradeline.isCollectionAccount as isCollectionAccount",
        "bureau.name as bureauName",
        "creditor.name as creditorName",
        "tradelineCreditor.name as tradelineCreditorName",
      ])
      .where("creditorObligationTest.id", "=", input.violationId)
      .executeTakeFirst();

    if (!row) {
      throw new BusinessRuleError("Compliance finding not found", 404);
    }

    if (user.role !== "admin" && row.tradelineUserId !== user.id) {
      throw new BusinessRuleError("You are not authorized to view this compliance finding", 403);
    }

    const explanation = await generateConsumerFindingExplanation({
      violation: {
        id: row.id,
        violationCategory: row.violationCategory,
        technicalDetails: row.technicalDetails,
        userExplanation: row.userExplanation,
        recommendedAction: row.recommendedAction,
      },
      context: {
        creditorName: row.creditorName ?? row.tradelineCreditorName ?? null,
        bureauName: row.bureauName,
        accountType: row.accountType,
        accountNumber: row.accountNumber,
        collectionAgencyName: row.collectionAgencyName,
        originalCreditorName: row.originalCreditorName,
        isCollectionAccount: row.isCollectionAccount,
      },
      userId: user.id,
      userRole: user.role,
    });

    return new Response(JSON.stringify(explanation satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error generating consumer finding explanation assist:", error);
    return handleEndpointError(error);
  }
}
