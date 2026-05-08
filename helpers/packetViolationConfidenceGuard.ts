import { db } from "./db";
import { BusinessRuleError } from "./endpointErrorHandler";
import { evaluateViolationPacketConfidenceGate } from "./violationPacketConfidenceGate";

export async function assertCreditorObligationPacketReady(input: {
  creditorObligationTestId?: number | null;
  tradelineId?: number | null;
  userId: number;
  isAdmin: boolean;
}): Promise<void> {
  if (input.creditorObligationTestId == null) return;

  const violation = await db
    .selectFrom("creditorObligationTest")
    .leftJoin("tradeline", "tradeline.id", "creditorObligationTest.tradelineId")
    .select([
      "creditorObligationTest.id as id",
      "creditorObligationTest.tradelineId as violationTradelineId",
      "creditorObligationTest.technicalDetails as technicalDetails",
      "creditorObligationTest.validationStatus as validationStatus",
      "creditorObligationTest.userStatus as userStatus",
      "tradeline.userId as tradelineUserId",
    ])
    .where("creditorObligationTest.id", "=", input.creditorObligationTestId)
    .executeTakeFirst();

  if (!violation) {
    throw new BusinessRuleError("The selected compliance finding was not found.", 404);
  }

  if (
    input.tradelineId != null &&
    violation.violationTradelineId != null &&
    violation.violationTradelineId !== input.tradelineId
  ) {
    throw new BusinessRuleError(
      "The selected compliance finding does not belong to this tradeline.",
      400,
    );
  }

  if (!input.isAdmin && violation.tradelineUserId !== input.userId) {
    throw new BusinessRuleError(
      "You do not have access to this compliance finding.",
      403,
    );
  }

  const gate = evaluateViolationPacketConfidenceGate({
    technicalDetails: violation.technicalDetails,
    validationStatus: violation.validationStatus,
    userStatus: violation.userStatus,
  });

  if (!gate.packetReady) {
    throw new BusinessRuleError(gate.message, 409);
  }
}
