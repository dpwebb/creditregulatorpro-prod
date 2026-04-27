import { useQuery } from "@tanstack/react-query";
import {
  getAuditLogs,
  InputType as AuditLogsInput,
  OutputType as AuditLogsOutput,
} from "../endpoints/admin/audit-logs_GET.schema";
import {
  getAdminUsers,
  InputType as AdminUsersInput,
  OutputType as AdminUsersOutput,
} from "../endpoints/admin/users_GET.schema";

// Query Keys
export const ADMIN_QUERY_KEYS = {
  auditLogs: (filters: AuditLogsInput) => ["admin", "auditLogs", filters] as const,
  users: (filters: AdminUsersInput) => ["admin", "users", filters] as const,
};

/**
 * Hook to fetch audit logs with filtering and pagination.
 * Uses placeholderData to keep previous data while fetching new pages/filters.
 */
export function useAuditLogs(filters: AuditLogsInput) {
  return useQuery({
    queryKey: ADMIN_QUERY_KEYS.auditLogs(filters),
    queryFn: () => getAuditLogs(filters),
    placeholderData: (prev) => prev,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch users list with stats for admin dashboard.
 */
export function useAdminUsers(filters: AdminUsersInput) {
  return useQuery({
    queryKey: ADMIN_QUERY_KEYS.users(filters),
    queryFn: () => getAdminUsers(filters),
    placeholderData: (prev) => prev,
    staleTime: 60 * 1000, // 1 minute
  });
}

// Export types for convenience
export type { AuditLogsInput, AuditLogsOutput, AdminUsersInput, AdminUsersOutput };