import type { User } from "./User";

export type SubscriptionAccessReason =
  | "staff"
  | "active_paid"
  | "active_trial"
  | "missing_subscription"
  | "trial_expired"
  | "inactive_status";

export interface SubscriptionAccessInput {
  role?: User["role"] | null;
  subscriptionPlan?: string | null;
  subscriptionStatus?: string | null;
  trialEnd?: Date | string | null;
}

export interface SubscriptionAccessResult {
  blocked: boolean;
  reason: SubscriptionAccessReason;
  title: string;
  message: string;
  isTrialExpired: boolean;
}

function parseDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function evaluateSubscriptionAccess(
  input: SubscriptionAccessInput,
  now: Date = new Date()
): SubscriptionAccessResult {
  if (input.role === "admin" || input.role === "support") {
    return {
      blocked: false,
      reason: "staff",
      title: "",
      message: "",
      isTrialExpired: false,
    };
  }

  const plan = input.subscriptionPlan ?? null;
  const status = input.subscriptionStatus ?? null;
  const trialEnd = parseDate(input.trialEnd);
  const isTrialExpired = !!trialEnd && trialEnd.getTime() < now.getTime();

  if (!plan || !status) {
    return {
      blocked: true,
      reason: "missing_subscription",
      title: "Subscription Inactive",
      message: "Your subscription is inactive. Please choose a plan to regain access to your account.",
      isTrialExpired: false,
    };
  }

  if (status === "expired" || status === "cancelled" || status === "past_due") {
    return {
      blocked: true,
      reason: "inactive_status",
      title: status === "past_due" ? "Payment Past Due" : "Subscription Inactive",
      message: `Your subscription is currently ${status.replace("_", " ")}. Please update your billing information to regain access to your account.`,
      isTrialExpired,
    };
  }

  const isTrialPlan = plan === "beta" || status === "trialing";
  if (isTrialPlan) {
    if (!trialEnd || isTrialExpired) {
      return {
        blocked: true,
        reason: "trial_expired",
        title: "Free Trial Expired",
        message: "Your free trial has expired. Please subscribe to regain access to your account.",
        isTrialExpired: true,
      };
    }

    return {
      blocked: false,
      reason: "active_trial",
      title: "",
      message: "",
      isTrialExpired: false,
    };
  }

  if ((plan === "monthly" || plan === "annual") && status === "active") {
    return {
      blocked: false,
      reason: "active_paid",
      title: "",
      message: "",
      isTrialExpired: false,
    };
  }

  return {
    blocked: true,
    reason: "inactive_status",
    title: "Subscription Inactive",
    message: `Your subscription is currently ${status.replace("_", " ")}. Please update your billing information to regain access to your account.`,
    isTrialExpired,
  };
}

export function subscriptionAccessErrorResponse(result: SubscriptionAccessResult): Response {
  return new Response(JSON.stringify({ error: result.message }), {
    status: 402,
    headers: { "Content-Type": "application/json" },
  });
}
