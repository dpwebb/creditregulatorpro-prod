import type { Selectable } from "kysely";
import { regulationRegistry } from "./regulationRegistry";
import { db } from "./db";
import type { Tradeline } from "./schema";
import type { DetectedViolation } from "./complianceDetectorTypes";
import { differenceInDays } from "./dateUtils";

/**
 * Checks if the consumer has disputed an account but the bureau failed to
 * add a mandatory 'dispute' consumer statement to the credit report.
 */
export async function detectConsumerStatementSuppression(
  tradeline: Selectable<Tradeline>
): Promise<DetectedViolation[]> {
  const violations: DetectedViolation[] = [];

  if (!tradeline.id || !tradeline.reportArtifactId) {
    return violations;
  }

  // 1. Fetch the report artifact to get its reportDate
  const artifact = await db
    .selectFrom("reportArtifact")
    .select(["reportDate"])
    .where("id", "=", tradeline.reportArtifactId)
    .executeTakeFirst();

  if (!artifact?.reportDate) {
    return violations;
  }
  const reportDate = new Date(artifact.reportDate);

  // 2. Check if the account has been actively challenged
  const disputes = await db
    .selectFrom("obligationInstance")
    .select(["id", "challengeSentDate"])
    .where("tradelineId", "=", tradeline.id)
    .where((eb) =>
      eb.or([
        eb("state", "=", "CHALLENGED"),
        eb("challengeSentDate", "is not", null),
      ])
    )
    .execute();

  if (disputes.length === 0) {
    return violations;
  }

  // 3. Only flag if challenge was sent 30+ days before the report's date
  const hasValidDispute = disputes.some((dispute) => {
    if (!dispute.challengeSentDate) return false;
    const challengeDate = new Date(dispute.challengeSentDate);
    return differenceInDays(reportDate, challengeDate) >= 30;
  });

  if (!hasValidDispute) {
    return violations;
  }

  // 4. Check if a dispute statement was appropriately recorded in the artifact
  const statements = await db
    .selectFrom("reportConsumerStatement")
    .select("id")
    .where("reportArtifactId", "=", tradeline.reportArtifactId)
    .where("statementType", "=", "dispute")
    .execute();

  if (statements.length === 0) {
    violations.push({
      violationCategory: "CONSUMER_STATEMENT_SUPPRESSION",
      severity: "ERROR",
      confidenceScore: 85,
      userExplanation:
        "The credit report is missing a mandatory DISPUTE STATEMENT for this challenged account.",
      technicalDetails: {
        tradelineId: tradeline.id,
        reportArtifactId: tradeline.reportArtifactId,
        activeDisputesFound: disputes.length,
        statementsFound: 0,
        detectedValue: 0,
        regulationIds: ["PIPEDA_4_6_1", "PIPEDA_4_9"],
      },
      recommendedAction:
        "Demand that the bureau immediately mark this account as actively disputed, or delete it entirely for suppressing your legal rights.",
      tradelineId: tradeline.id,
      responsibleEntity: "BUREAU",
    });
  }

  return violations;
}