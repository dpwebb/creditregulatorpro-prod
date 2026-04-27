import { useQuery } from "@tanstack/react-query";
import { getAdminUserDetail } from "../endpoints/admin/user-detail_GET.schema";

export const ADMIN_USER_DETAIL_QUERY_KEY = (userId: number) => ["admin", "user-detail", userId] as const;

export function useAdminUserDetail(userId: number | undefined) {
  return useQuery({
    queryKey: ADMIN_USER_DETAIL_QUERY_KEY(userId as number),
    queryFn: async () => {
      if (userId === undefined) {
        throw new Error("userId is required");
      }
      return getAdminUserDetail({ userId });
    },
    enabled: userId !== undefined,
  });
}