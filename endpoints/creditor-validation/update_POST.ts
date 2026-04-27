import { schema, OutputType } from "./update_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { 
  detectResponseDeficiencies,
  calculateTimingDrift,
  selectNextVector,
  calculateResponseDeadline,
  TestHistoryItem,
  executeEscalationPath
} from "../../helpers/obligationTestEngine";
import { DisputeVectorType } from "../../helpers/obligationVectors";

export async function handle(request: Request) {
  try {
    await getServerUserSession(request);

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    const now = new Date();

    // Fetch the current test record
    const currentTest = await db
      .selectFrom('creditorObligationTest')
      .selectAll()
      .where('id', '=', input.id)
      .executeTakeFirst();

    if (!currentTest) {
      throw new BusinessRuleError("Obligation test not found", 404);
    }

    // Build test history from database records for this creditor
    const historicalTests = await db
      .selectFrom('creditorObligationTest')
      .selectAll()
      .where('creditorId', '=', currentTest.creditorId || 0)
      .where('obligationType', '=', currentTest.obligationType)
      .orderBy('lastChallengeDate', 'asc')
      .execute();

    const testHistory: TestHistoryItem[] = historicalTests
      .filter(test => test.lastChallengeDate && test.disputeVector)
      .map(test => ({
        sequenceId: test.obligationSequence || 1,
        vector: test.disputeVector as DisputeVectorType,
        dateSent: new Date(test.lastChallengeDate!),
        responseReceived: (test.responsesReceived || 0) > 0,
        responseDate: test.lastTestDate ? new Date(test.lastTestDate) : undefined,
        outcome: 
          test.obligationState === 'INSUFFICIENT_RESPONSE' ? 'INSUFFICIENT' :
          test.obligationState === 'NO_RESPONSE' ? 'NO_RESPONSE' :
          'SUFFICIENT'
      }));

    let deficiencies: string[] = [];
    let timingDrift = 0;
    let newObligationState = currentTest.obligationState;
    let nextDisputeVector: DisputeVectorType | null = currentTest.disputeVector as DisputeVectorType;
    let nextSequenceId = currentTest.obligationSequence || 1;
    let escalationPath = currentTest.escalationPath || null;
    let newDeadline = currentTest.responseDeadline;

    // If no response received
    if (!input.responseReceived) {
      newObligationState = 'NO_RESPONSE';
      deficiencies.push("No response received from creditor");
      
      // Calculate timing drift from deadline
      if (currentTest.responseDeadline) {
        timingDrift = calculateTimingDrift(now, new Date(currentTest.responseDeadline));
      }
      
      // Execute escalation path for NO_RESPONSE
      const escalationResult = executeEscalationPath(
        'NO_RESPONSE',
        currentTest.responseDeadline,
        currentTest.disputeVector as DisputeVectorType,
        currentTest.obligationSequence || 1,
        currentTest.responsesReceived || 0
      );
      
      escalationPath = escalationResult.escalationData;
      newDeadline = escalationResult.nextDeadline;
      
    } else {
      // Response received - analyze it
      const responseText = input.responseText || "";
      const currentVector = currentTest.disputeVector as DisputeVectorType;
      
      deficiencies = detectResponseDeficiencies(responseText, currentVector);
      
      // Calculate timing drift if response date provided
      if (input.responseDate && currentTest.responseDeadline) {
        timingDrift = calculateTimingDrift(
          new Date(input.responseDate),
          new Date(currentTest.responseDeadline)
        );
      }

      // Add current response to history
      const currentTestHistory: TestHistoryItem = {
        sequenceId: currentTest.obligationSequence || 1,
        vector: currentVector,
        dateSent: new Date(currentTest.lastChallengeDate || now),
        responseReceived: true,
        responseDate: input.responseDate || now,
        outcome: deficiencies.length > 0 ? 'INSUFFICIENT' : 'SUFFICIENT'
      };
      
      const fullHistory = [...testHistory, currentTestHistory];

      // Determine next state based on deficiencies
      if (deficiencies.length > 0) {
        newObligationState = 'INSUFFICIENT_RESPONSE';
        
        // Auto-rotate to next vector
        const nextVectorResult = selectNextVector(
          currentTest.obligationSequence || 1,
          fullHistory
        );
        
        if (nextVectorResult.isExhausted) {
          // Mark as procedurally exhausted
          newObligationState = 'PROCEDURALLY_EXHAUSTED';
          nextDisputeVector = currentVector; // Keep current vector for reference
          nextSequenceId = currentTest.obligationSequence || 1;
          
          // Execute escalation path for EXHAUSTED
          const escalationResult = executeEscalationPath(
            'PROCEDURALLY_EXHAUSTED',
            currentTest.responseDeadline,
            currentVector,
            nextSequenceId,
            (currentTest.responsesReceived || 0) + 1
          );
          
          escalationPath = escalationResult.escalationData;
          newDeadline = null;
        } else {
          // Rotate to next vector
          nextDisputeVector = nextVectorResult.nextVector;
          nextSequenceId = nextVectorResult.nextSequenceId;
          
          // Calculate new deadline for next vector
          if (nextDisputeVector) {
            newDeadline = calculateResponseDeadline(nextDisputeVector);
          }
          
          // Execute escalation path for INSUFFICIENT_RESPONSE
          const escalationResult = executeEscalationPath(
            'INSUFFICIENT_RESPONSE',
            newDeadline,
            nextDisputeVector!,
            nextSequenceId,
            (currentTest.responsesReceived || 0) + 1
          );
          
          escalationPath = escalationResult.escalationData;
        }
      } else {
        // Sufficient response (rare) - check if we should continue or mark complete
        // Even with sufficient response, continue sequence to build comprehensive record
        const nextVectorResult = selectNextVector(
          currentTest.obligationSequence || 1,
          fullHistory
        );
        
        if (nextVectorResult.isExhausted) {
          newObligationState = 'PROCEDURALLY_EXHAUSTED';
          
          const escalationResult = executeEscalationPath(
            'PROCEDURALLY_EXHAUSTED',
            currentTest.responseDeadline,
            currentVector,
            currentTest.obligationSequence || 1,
            (currentTest.responsesReceived || 0) + 1
          );
          
          escalationPath = escalationResult.escalationData;
          newDeadline = null;
        } else {
          newObligationState = 'OBLIGATION_PENDING';
          nextDisputeVector = nextVectorResult.nextVector;
          nextSequenceId = nextVectorResult.nextSequenceId;
          
          if (nextDisputeVector) {
            newDeadline = calculateResponseDeadline(nextDisputeVector);
          }
          
          const escalationResult = executeEscalationPath(
            'OBLIGATION_PENDING',
            newDeadline,
            nextDisputeVector!,
            nextSequenceId,
            (currentTest.responsesReceived || 0) + 1
          );
          
          escalationPath = escalationResult.escalationData;
        }
      }
    }

    // Update the test record with auto-rotation results
    const updatedTest = await db
      .updateTable('creditorObligationTest')
      .set({
        obligationState: newObligationState,
        obligationSequence: nextSequenceId,
        disputeVector: nextDisputeVector,
        responseDeadline: newDeadline,
        responsesReceived: (currentTest.responsesReceived || 0) + (input.responseReceived ? 1 : 0),
        omissions: deficiencies.length > 0 ? deficiencies.join('; ') : null,
        escalationPath: escalationPath,
        lastTestDate: now,
        notes: input.notes || currentTest.notes,
        updatedAt: now,
      })
      .where('id', '=', input.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    // Log the challenge outcome
    await db
      .insertInto('obligationChallengeLog')
      .values({
        tradelineId: currentTest.tradelineId ?? null,
        challengeBasis: currentTest.disputeVector || '',
        challengeVector: currentTest.disputeVector || '',
        deficiencies: deficiencies.join('; '),
        timingDriftDays: timingDrift,
        severity: deficiencies.length > 0 ? 'WARNING' : 'INFO',
        message: input.responseReceived 
          ? `Response analyzed: ${deficiencies.length} deficiencies found. ${newObligationState === 'PROCEDURALLY_EXHAUSTED' ? 'Procedurally exhausted.' : `Auto-rotated to ${nextDisputeVector || 'next vector'}.`}`
          : 'No response received from creditor. Extended deadline applied.',
        detectedAt: now,
        responseReceived: input.responseReceived,
        responseDate: input.responseDate || null,
      })
      .execute();

    console.log(`Updated creditor obligation test ${input.id}: ${newObligationState}, deficiencies: ${deficiencies.length}, auto-rotated: ${nextDisputeVector || 'N/A'}`);

    // Parse escalation data for response
    let nextAction = 'UNKNOWN';
    try {
      const escalationData = escalationPath ? JSON.parse(escalationPath) : null;
      nextAction = escalationData?.type || 'UNKNOWN';
    } catch (e) {
      nextAction = escalationPath || 'UNKNOWN';
    }

    return new Response(JSON.stringify({ 
      obligationTest: updatedTest,
      deficiencies,
      timingDrift,
      nextAction,
      autoRotated: nextDisputeVector !== currentTest.disputeVector,
      isExhausted: newObligationState === 'PROCEDURALLY_EXHAUSTED'
    } satisfies OutputType));
  } catch (error) {
    console.error("Error updating creditor obligation test:", error);
    return handleEndpointError(error);
  }
}