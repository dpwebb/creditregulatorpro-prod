import { DisputeVectorType } from "./obligationVectors";

/**
 * Terminal Label Progression Phases
 *
 * Defines the strict progression of terminal labels for Canadian dispute proceedings.
 * The progression consists of 4 phases.
 */

export type TerminalLabelPhase =
  | "PHASE 1: FOUNDATIONAL CHALLENGE — PENDING"
  | "PHASE 2: METHODOLOGICAL CHALLENGE — PENDING"
  | "PHASE 3: SUBSTANTIVE CHALLENGE — PENDING"
  | "PHASE 4: PROCEDURAL EXHAUSTION — PENDING";

export interface TerminalPhaseDefinition {
  phase: TerminalLabelPhase;
  phaseNumber: number;
  label: string;
  description: string;
  associatedVectors: DisputeVectorType[];
}

export const TERMINAL_LABEL_PHASES: TerminalPhaseDefinition[] = [
  {
    phase: "PHASE 1: FOUNDATIONAL CHALLENGE — PENDING",
    phaseNumber: 1,
    label: "Foundational Challenge",
    description: "Initial challenge regarding authority to report and permissible purpose.",
    associatedVectors: ["AUTHORITY_TO_REPORT", "PERMISSIBLE_PURPOSE"],
  },
  {
    phase: "PHASE 2: METHODOLOGICAL CHALLENGE — PENDING",
    phaseNumber: 2,
    label: "Methodological Challenge",
    description: "Challenge regarding verification methods and completeness of data.",
    associatedVectors: ["VERIFICATION_METHOD", "COMPLETENESS_ATTESTATION"],
  },
  {
    phase: "PHASE 3: SUBSTANTIVE CHALLENGE — PENDING",
    phaseNumber: 3,
    label: "Substantive Challenge",
    description: "Challenge regarding accuracy attestation and investigation procedures.",
    associatedVectors: ["ACCURACY_ATTESTATION", "INVESTIGATION_PROCEDURE"],
  },
  {
    phase: "PHASE 4: PROCEDURAL EXHAUSTION — PENDING",
    phaseNumber: 4,
    label: "Procedural Exhaustion",
    description: "Final procedural challenge regarding timing compliance.",
    associatedVectors: ["TIMING_COMPLIANCE"],
  },
];

/**
 * Determines the current terminal label phase based on the active dispute vector.
 *
 * @param disputeVector The current active dispute vector.
 * @param exhaustionStatus Whether the tradeline is marked as fully exhausted.
 * @returns The corresponding TerminalLabelPhase.
 */
export const getTerminalLabelFromVector = (
  disputeVector: string | null,
  exhaustionStatus: boolean
): TerminalLabelPhase => {
  if (exhaustionStatus) {
    return "PHASE 4: PROCEDURAL EXHAUSTION — PENDING";
  }

  if (!disputeVector) {
    return "PHASE 1: FOUNDATIONAL CHALLENGE — PENDING";
  }

  const foundPhase = TERMINAL_LABEL_PHASES.find((p) =>
    p.associatedVectors.includes(disputeVector as DisputeVectorType)
  );

  if (foundPhase) {
    return foundPhase.phase;
  }

  return "PHASE 1: FOUNDATIONAL CHALLENGE — PENDING";
};

/**
 * Determines the terminal label phase based on the escalation count (1-based index).
 * Caps at Phase 4.
 *
 * @param count The number of escalations/rounds completed.
 * @returns The corresponding TerminalLabelPhase.
 */
export const getTerminalLabelFromEscalationCount = (
  count: number
): TerminalLabelPhase => {
  const safeCount = Math.max(1, count);

  // Cap at Phase 4 (index 3)
  const phaseIndex = Math.min(safeCount - 1, 3); // 0 to 3
  return TERMINAL_LABEL_PHASES[phaseIndex].phase;
};

/**
 * Calculates the terminal label phase from an array of obligation instances.
 * If any instance has state === 'PROCEDURALLY_EXHAUSTED', returns Phase 4.
 * Otherwise, uses getTerminalLabelFromEscalationCount with the count of instances.
 *
 * @param instances Array of obligation instances with at least a `state` field.
 * @returns The corresponding TerminalLabelPhase.
 */
export const calculateTerminalLabel = (
  instances: Array<{ state: string | null }>
): TerminalLabelPhase => {
  const hasExhaustedInstance = instances.some(
    (inst) => inst.state === "PROCEDURALLY_EXHAUSTED"
  );

  if (hasExhaustedInstance) {
    return "PHASE 4: PROCEDURAL EXHAUSTION — PENDING";
  }

  return getTerminalLabelFromEscalationCount(instances.length);
};

/**
 * Returns progress information for a given phase.
 *
 * @param phase The current terminal label phase.
 * @returns Object containing current step and total steps.
 */
export const getPhaseProgress = (
  phase: TerminalLabelPhase
): { current: number; total: number } => {
  const found = TERMINAL_LABEL_PHASES.find((p) => p.phase === phase);
  const current = found ? found.phaseNumber : 1;
  const total = TERMINAL_LABEL_PHASES.length; // 4

  return { current, total };
};