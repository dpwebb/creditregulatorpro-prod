interface PressureScoreInput {
  severity: number;
  likelihood: number;
  leverage: number;
  clockShortness: number;
}

/**
 * Calculates a pressure score based on severity, likelihood, leverage, and clock shortness.
 *
 * Formula: severity * likelihood * leverage * clockShortness
 */
export function pressureScore({
  severity,
  likelihood,
  leverage,
  clockShortness,
}: PressureScoreInput): number {
  return severity * likelihood * leverage * clockShortness;
}