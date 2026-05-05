import { schema, OutputType } from "./create_POST.schema";

import { db } from "../../helpers/db";
import { BusinessRuleError, handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { 
  analyzeTradelineForTriggers, 
  calculateResponseDeadline,
  logObligationChallenge 
} from "../../helpers/obligationTestEngine";
import { TL } from "../../helpers/metro2";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    const now = new Date();

    // Fetch the tradeline to analyze
    const tradeline = await db
      .selectFrom('tradeline')
      .selectAll()
      .where('id', '=', input.tradelineId)
      .executeTakeFirstOrThrow();

    if (user.role !== "admin" && tradeline.userId !== user.id) {
      throw new BusinessRuleError("You are not authorized to create a challenge for this tradeline", 403);
    }

    // Convert DB tradeline to TL format for analysis
    const tlForAnalysis: TL = {
      amounts: {
        high: Number(tradeline.highCredit || 0),
        current: Number(tradeline.currentBalance || 0),
        pastDue: Number(tradeline.amountPastDue || 0),
      },
      dates: {
        opened: tradeline.openedDate || null,
        reported: tradeline.createdAt || null,
        closed: tradeline.dateClosed || null,
        dofd: tradeline.dateOfFirstDelinquency || null,
        chargeOff: null,
      },
      status: tradeline.status || '',
      remarkCodes: [],
      payment: {
        scheduledMonthly: Number(tradeline.scheduledMonthlyPayment || 0),
      },
    };

    // Analyze tradeline to determine first dispute vector
    const triggers = analyzeTradelineForTriggers(tlForAnalysis, input.metro2Version);
    
    // Select the highest severity trigger
    const primaryTrigger = triggers.sort((a, b) => {
      const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    })[0];

    if (!primaryTrigger) {
      return new Response(
        JSON.stringify({ error: "No obligation test vectors identified for this tradeline" }), 
        { status: 400 }
      );
    }

    const disputeVector = primaryTrigger.vector;
    const responseDeadline = calculateResponseDeadline(disputeVector);

    // Create creditor_obligation_test record
    const newTest = await db
      .insertInto('creditorObligationTest')
      .values({
        creditorId: input.creditorId,
        tradelineId: input.tradelineId,
        obligationType: input.obligationType,
        obligationState: 'CHALLENGED',
        obligationSequence: 1,
        disputeVector: disputeVector,
        lastChallengeDate: now,
        responseDeadline: responseDeadline,
        responsesReceived: 0,
        metro2Version: input.metro2Version || null,
        notes: input.notes || null,
        statutoryBasis: primaryTrigger.reason,
        omissions: null,
        validationStatus: 'PENDING',
        detectedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Log the challenge
    const challengeLog = logObligationChallenge(
      input.tradelineId,
      disputeVector,
      [],
      0,
      'INFO'
    );

    await db
      .insertInto('obligationChallengeLog')
      .values({
        tradelineId: challengeLog.tradelineId,
        challengeBasis: challengeLog.challengeBasis,
        deficiencies: challengeLog.deficiencies,
        timingDriftDays: challengeLog.timingDriftDays,
        severity: challengeLog.severity,
        message: challengeLog.message,
        detectedAt: challengeLog.detectedAt,
        responseReceived: false,
      })
      .execute();

    console.log(`Created creditor obligation test challenge: ${disputeVector} for tradeline ${input.tradelineId}`);

    return new Response(JSON.stringify({ obligationTest: newTest } satisfies OutputType));
  } catch (error) {
    console.error("Error creating creditor obligation test:", error);
    return handleEndpointError(error);
  }
}
