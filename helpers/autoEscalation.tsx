const RESET_MESSAGE =
  "Legacy dispute escalation has been reset and is not available in this build.";

export const scanForEscalation = async () => {
  return [];
};

export const triggerEscalation = async (_obligationInstanceId?: number): Promise<never> => {
  throw new Error(RESET_MESSAGE);
};

export const checkExhaustion = async () => {
  return {
    isExhausted: false,
    escalationCount: 0,
    reason: null,
  };
};

export const markAsExhausted = async (): Promise<never> => {
  throw new Error(RESET_MESSAGE);
};
