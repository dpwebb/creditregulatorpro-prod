export const TRIAL_USER_PLAN_LABEL = "Trial User";

export function isTrialUserPlan(plan: string | null | undefined): boolean {
  return plan?.toLowerCase() === "beta";
}

export function getSubscriptionPlanLabel(plan: string | null | undefined): string {
  if (!plan) return "No Plan";
  if (isTrialUserPlan(plan)) return TRIAL_USER_PLAN_LABEL;

  return plan.charAt(0).toUpperCase() + plan.slice(1);
}
