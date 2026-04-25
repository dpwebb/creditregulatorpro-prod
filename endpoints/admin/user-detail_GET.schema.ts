import { z } from "zod";

import { 
  UserRole, 
  SubscriptionPlan, 
  SubscriptionStatus,
  AuditActionType,
  AuditEntityType,
  AuditStatus,
  JsonValue
} from "../../helpers/schema";

export const schema = z.object({
  userId: z.coerce.number(),
});

export type InputType = z.infer<typeof schema>;

export type UserDetailOutput = {
  user: {
    id: number;
    email: string;
    displayName: string;
    role: UserRole;
    emailVerified: boolean;
    avatarUrl: string | null;
    createdAt: Date;
  };
  subscription: {
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
    trialStart: Date;
    trialEnd: Date;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    priceCad: string | number | null;
    stripeCustomerId: string | null;
  } | null;
  tradelines: Array<{
    id: number;
    accountNumber: string;
    creditorName: string;
    status: string | null;
    bureauName: string | null;
    balance: string | number | null;
    openedDate: Date | null;
    lastReportedDate: Date | null;
  }>;
  packets: Array<{
    id: number;
    status: string | null;
    type: string | null;
    createdAt: Date | null;
    tradelineAccountNumber: string | null;
    creditorName: string | null;
    originalCreditorName: string | null;
    terminalLabel: string | null;
    deliveryMethod: string | null;
    violationCategory: string | null;
    obligationType: string | null;
  }>;
  reportArtifacts: Array<{
    id: number;
    artifactType: string | null;
    createdAt: Date | null;
    reportDate: Date | null;
    region: string | null;
  }>;
  recentActivity: Array<{
    id: number;
    actionType: AuditActionType;
    entityType: AuditEntityType;
    entityId: number | null;
    timestamp: Date;
    status: AuditStatus;
    details: JsonValue | null;
  }>;
};

export type OutputType = UserDetailOutput;

export const getAdminUserDetail = async (
  params: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const searchParams = new URLSearchParams();
  searchParams.append("userId", params.userId.toString());

  const result = await fetch(`/_api/admin/user-detail?${searchParams.toString()}`, {
    method: "GET",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!result.ok) {
    const errorText = await result.text();
    let errorMessage = "An error occurred";
    try {
      const errorObject = JSON.parse(errorText);
      errorMessage = errorObject.error;
    } catch {
      try {
        const errorObject = JSON.parse(errorText);
        errorMessage = errorObject.error || errorMessage;
      } catch {
        errorMessage = errorText;
      }
    }
    throw new Error(errorMessage);
  }
  return JSON.parse(await result.text());
};