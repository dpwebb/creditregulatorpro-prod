import { z } from "zod";

import { UserRole, SubscriptionPlan, SubscriptionStatus } from "../../helpers/schema";

export const schema = z.object({
  role: z.enum(["admin", "user", "support"]).optional(),
  

  search: z.string().optional(),
});

export type InputType = z.infer<typeof schema>;

export type AdminUserEntry = {
  id: number;
  email: string;
  displayName: string;
  fullName: string | null;
  role: UserRole;
  createdAt: Date;
  emailVerified: boolean;
  avatarUrl: string | null;
  tradelinesCount: number;
  packetsCount: number;
  evidenceEventsCount: number;
  subscriptionPlan: SubscriptionPlan | null;
  subscriptionStatus: SubscriptionStatus | null;
  reportArtifactsCount: number;
};

export type OutputType = AdminUserEntry[];

export const getAdminUsers = async (
  params: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const searchParams = new URLSearchParams();
  if (params.role) searchParams.append("role", params.role);
  if (params.search) searchParams.append("search", params.search);

  const result = await fetch(`/_api/admin/users?${searchParams.toString()}`, {
    method: "GET",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!result.ok) {
    const errorObject = JSON.parse(await result.text());
    throw new Error(errorObject.error);
  }
  return JSON.parse(await result.text());
};