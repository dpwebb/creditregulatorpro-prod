import {
  DISPUTE_VECTORS,
  DisputeVectorType,
  OBLIGATION_SEQUENCES,
  STATUTORY_TIMING_DEFAULTS,
  DEFICIENCY_PATTERNS,
} from "./obligationVectors";
import { TL, validateTradeline } from "./metro2";
import { ObligationState } from "./schema";

// Native date helpers to replace date-fns
const addDays = (date: Date | string | number, days: number): Date => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const differenceInDays = (dateLeft: Date, dateRight: Date): number => {
  const diffTime = dateLeft.getTime() - dateRight.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
};

const isValid = (date: any): date is Date => {
  return date instanceof Date && !isNaN(date.getTime());
};

// Types for the engine
export interface ObligationTrigger {
  vector: DisputeVectorType;
  reason: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
}

export interface ResponseAnalysis {
  isDeficient: boolean;
  deficiencies: string[];
  timingDrift: number; // Days late (negative means early/on-time)
  recommendedNextAction: "ESCALATE" | "ROTATE_VECTOR" | "CLOSE_EXHAUSTED";
}

export interface TestHistoryItem {
  sequenceId: number;
  vector: DisputeVectorType;
  dateSent: Date;
  responseReceived: boolean;
  responseDate?: Date;
  outcome: "SUFFICIENT" | "INSUFFICIENT" | "NO_RESPONSE";
}

/**
 * Analyzes a tradeline to detect which obligations to test based on data deficiencies.
 * Uses Metro2 analysis as evidence for triggers.
 */
export function analyzeTradelineForTriggers(
  tradeline: TL,
  metro2Version?: string,
): ObligationTrigger[] {
  const triggers: ObligationTrigger[] = [];

  // 1. Run Metro2 Validation
  const validationResults = validateTradeline(tradeline, metro2Version);
  const hasErrors = validationResults.some((r) => !r.valid);

  // 2. Map Metro2 failures to Dispute Vectors

  // If there are basic data integrity issues, challenge Accuracy & Completeness
  if (hasErrors) {
    triggers.push({
      vector: "ACCURACY_ATTESTATION",
      reason: "Metro2 validation failure indicates potential accuracy defects",
      severity: "HIGH",
    });
    triggers.push({
      vector: "COMPLETENESS_ATTESTATION",
      reason: "Data format inconsistencies suggest incomplete reporting",
      severity: "MEDIUM",
    });
  }

  // If account is open but data is sparse, challenge Permissible Purpose
  // (Heuristic: Missing payment history or limits on open account)
  if (
    tradeline.status &&
    !tradeline.status.toLowerCase().includes("closed") &&
    (!tradeline.amounts.high || !tradeline.amounts.current)
  ) {
    triggers.push({
      vector: "PERMISSIBLE_PURPOSE",
      reason: "Active reporting without complete financial data",
      severity: "HIGH",
    });
  }

  // If there are derogatory markers (Past Due > 0), challenge Verification Method
  if (tradeline.amounts.pastDue > 0) {
    triggers.push({
      vector: "VERIFICATION_METHOD",
      reason: "Derogatory status requires strict verification method disclosure",
      severity: "HIGH",
    });
  }

  // If no specific triggers found, default to Authority challenge (Foundational)
  if (triggers.length === 0) {
    triggers.push({
      vector: "AUTHORITY_TO_REPORT",
      reason: "Baseline procedural verification",
      severity: "LOW",
    });
  }

  return triggers;
}

/**
 * Determines the next dispute vector to rotate to based on current sequence and history.
 */
export function selectNextVector(
  currentSequenceId: number,
  priorResponses: TestHistoryItem[],
): {
  nextVector: DisputeVectorType | null;
  nextSequenceId: number;
  isExhausted: boolean;
} {
  // Find current sequence definition
  const currentSeq = OBLIGATION_SEQUENCES.find(
    (s) => s.sequenceId === currentSequenceId,
  );

  if (!currentSeq) {
    // Start at beginning if invalid
    return {
      nextVector: OBLIGATION_SEQUENCES[0].vectors[0].type,
      nextSequenceId: 1,
      isExhausted: false,
    };
  }

  // Check if we have tried all vectors in the current sequence
  const vectorsInCurrent = currentSeq.vectors.map((v) => v.type);
  const triedInCurrent = priorResponses
    .filter((r) => r.sequenceId === currentSequenceId)
    .map((r) => r.vector);

  const remainingInCurrent = vectorsInCurrent.filter(
    (v) => !triedInCurrent.includes(v),
  );

  if (remainingInCurrent.length > 0) {
    // Still have vectors in this sequence
    return {
      nextVector: remainingInCurrent[0],
      nextSequenceId: currentSequenceId,
      isExhausted: false,
    };
  }

  // Move to next sequence
  const nextSeq = OBLIGATION_SEQUENCES.find(
    (s) => s.sequenceId === currentSequenceId + 1,
  );

  if (nextSeq) {
    return {
      nextVector: nextSeq.vectors[0].type,
      nextSequenceId: nextSeq.sequenceId,
      isExhausted: false,
    };
  }

  // No more sequences -> Exhausted
  return {
    nextVector: null,
    nextSequenceId: currentSequenceId,
    isExhausted: true,
  };
}

/**
 * Calculates the statutory deadline for a response.
 */
export function calculateResponseDeadline(
  challengeType: DisputeVectorType,
  jurisdictionRules?: { daysOverride?: number },
): Date {
  const days =
    jurisdictionRules?.daysOverride ?? STATUTORY_TIMING_DEFAULTS[challengeType];
  return addDays(new Date(), days);
}

/**
 * Identifies what was omitted from a creditor's response.
 */
export function detectResponseDeficiencies(
  responseText: string,
  challengeVector: DisputeVectorType,
): string[] {
  const deficiencies: string[] = [];
  const lowerText = responseText.toLowerCase();

  // Check for generic dismissals
  if (
    DEFICIENCY_PATTERNS.DISMISSIVE_LANGUAGE.some((pattern) =>
      lowerText.includes(pattern),
    )
  ) {
    deficiencies.push("Response uses dismissive/frivolous boilerplate");
  }

  // Check for generic verification without substance
  if (
    DEFICIENCY_PATTERNS.GENERIC_VERIFICATION.some((pattern) =>
      lowerText.includes(pattern),
    )
  ) {
    deficiencies.push("Generic verification provided without specific proofs");
  }

  // Vector-specific checks
  if (challengeVector === "VERIFICATION_METHOD") {
    if (
      !lowerText.includes("method") &&
      !lowerText.includes("procedure") &&
      !lowerText.includes("system")
    ) {
      deficiencies.push("Failed to disclose specific verification method");
    }
  }

  if (challengeVector === "AUTHORITY_TO_REPORT") {
    if (!lowerText.includes("agreement") && !lowerText.includes("contract")) {
      deficiencies.push("Failed to cite authority/agreement source");
    }
  }

  return deficiencies;
}

/**
 * Tracks procedural compliance by calculating timing drift.
 */
export function calculateTimingDrift(
  responseDate: Date,
  deadline: Date,
): number {
  if (!isValid(responseDate) || !isValid(deadline)) return 0;
  return differenceInDays(responseDate, deadline);
}

/**
 * Maps the next procedural step based on the state of the obligation test.
 */
export function determineEscalationPath(
  obligationState: ObligationState,
  responsesReceived: number,
  deficiencies: string[],
): "CONTINUE_SEQUENCE" | "ESCALATE_TO_FCAC" | "MARK_EXHAUSTED" | "RETRY" {
  if (obligationState === "PROCEDURALLY_EXHAUSTED") {
    return "MARK_EXHAUSTED";
  }

  if (obligationState === "NO_RESPONSE" && responsesReceived === 0) {
    // First no-response might just mean retry or move to next vector
    return "RETRY";
  }

  if (deficiencies.length > 0) {
    // If they responded but it was deficient, we escalate or rotate
    // For this engine, we usually rotate to build a bigger case unless it's egregious
    return "CONTINUE_SEQUENCE";
  }

  // If response was sufficient (rare in this adversarial model), we might still rotate
  return "CONTINUE_SEQUENCE";
}

/**
 * Checks if all vectors have been rotated through.
 */
export function isProcedurallyExhausted(
  testHistory: TestHistoryItem[],
): boolean {
  // Check if the last sequence has been touched
  const lastSeqId =
    OBLIGATION_SEQUENCES[OBLIGATION_SEQUENCES.length - 1].sequenceId;
  const hasReachedLastSeq = testHistory.some(
    (h) => h.sequenceId === lastSeqId,
  );

  // If we have reached the last sequence and have a result (even if no response),
  // we consider it exhausted for the purpose of this engine.
  // A stricter check might ensure ALL vectors were tried.
  return hasReachedLastSeq;
}

/**
 * Executes the recommended escalation path and returns structured action data.
 */
export function executeEscalationPath(
  obligationState: ObligationState,
  currentDeadline: Date | null,
  currentVector: DisputeVectorType,
  sequenceId: number,
  responsesReceived: number,
): {
  action: string;
  nextDeadline: Date | null;
  escalationData: string;
  requiresManualReview: boolean;
} {
  switch (obligationState) {
    case "NO_RESPONSE":
      // Auto-schedule retry with extended deadline
      const retryDeadline = currentDeadline
        ? addDays(new Date(currentDeadline), 15)
        : addDays(new Date(), 45); // 30 + 15 if no prior deadline
      return {
        action: "RETRY_CHALLENGE",
        nextDeadline: retryDeadline,
        escalationData: JSON.stringify({
          type: "NO_RESPONSE_RETRY",
          vector: currentVector,
          sequenceId,
          extendedBy: 15,
          attempt: responsesReceived + 1,
        }),
        requiresManualReview: false,
      };

    case "INSUFFICIENT_RESPONSE":
      // Confirm rotation to next vector
      return {
        action: "ROTATE_TO_NEXT_VECTOR",
        nextDeadline: null, // Will be calculated by selectNextVector
        escalationData: JSON.stringify({
          type: "DEFICIENT_RESPONSE_ROTATION",
          currentVector,
          currentSequence: sequenceId,
          deficienciesDetected: true,
        }),
        requiresManualReview: false,
      };

    case "PROCEDURALLY_EXHAUSTED":
      // Mark as ready for FCAC escalation
      return {
        action: "PREPARE_FCAC_COMPLAINT",
        nextDeadline: null,
        escalationData: JSON.stringify({
          type: "PROCEDURALLY_EXHAUSTED",
          completedSequences: 4,
          readyForFCACPacket: true,
          provincialAuthority: "PROVINCIAL_REGULATOR",
          totalResponses: responsesReceived,
        }),
        requiresManualReview: true,
      };

    case "CHALLENGED":
      // Awaiting response
      return {
        action: "AWAITING_RESPONSE",
        nextDeadline: currentDeadline,
        escalationData: JSON.stringify({
          type: "CHALLENGE_PENDING",
          vector: currentVector,
          sequenceId,
        }),
        requiresManualReview: false,
      };

    case "OBLIGATION_PENDING":
    default:
      // Default: prepare next challenge
      return {
        action: "PREPARE_NEXT_CHALLENGE",
        nextDeadline: null,
        escalationData: JSON.stringify({
          type: "PENDING_INITIATION",
          suggestedVector: currentVector,
        }),
        requiresManualReview: false,
      };
  }
}

/**
 * Helper to format a log entry for the database.
 * Does not write to DB directly, returns the object to be saved.
 */
export function logObligationChallenge(
  tradelineId: number,
  challengeVector: DisputeVectorType,
  deficiencies: string[],
  timingDrift: number,
  severity: "ERROR" | "WARNING" | "INFO",
) {
  return {
    tradelineId,
    challengeBasis: challengeVector,
    deficiencies: deficiencies.join("; "),
    timingDriftDays: timingDrift,
    severity,
    message:
      deficiencies.length > 0
        ? `Deficiency detected: ${deficiencies[0]}`
        : "Procedural step recorded",
    detectedAt: new Date(),
  };
}
