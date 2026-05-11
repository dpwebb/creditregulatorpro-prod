export type TerminalLabelPhase = "DISPUTE PROCESS RESET";

export const calculateTerminalLabel = (): TerminalLabelPhase => {
  return "DISPUTE PROCESS RESET";
};

export const getPhaseProgress = (): { current: number; total: number } => {
  return { current: 0, total: 0 };
};
