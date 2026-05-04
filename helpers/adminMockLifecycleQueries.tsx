import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getAdminMockLifecycleList } from "../endpoints/admin/mock-lifecycle/list_GET.schema";
import { getAdminMockLifecycleReport } from "../endpoints/admin/mock-lifecycle/report_GET.schema";
import { getAdminMockLifecycleStatus } from "../endpoints/admin/mock-lifecycle/status_GET.schema";
import { postAdminMockLifecycleRun } from "../endpoints/admin/mock-lifecycle/run_POST.schema";

export const ADMIN_MOCK_LIFECYCLE_KEYS = {
  all: ["admin-mock-lifecycle"] as const,
  list: (limit: number) => ["admin-mock-lifecycle", "list", limit] as const,
  status: (jobId: string) => ["admin-mock-lifecycle", "status", jobId] as const,
  report: (jobId: string) => ["admin-mock-lifecycle", "report", jobId] as const,
};

export function useAdminMockLifecycleList(limit = 25) {
  return useQuery({
    queryKey: ADMIN_MOCK_LIFECYCLE_KEYS.list(limit),
    queryFn: () => getAdminMockLifecycleList({ limit }),
    refetchInterval: 4000,
    refetchIntervalInBackground: false,
  });
}

export function useAdminMockLifecycleStatus(jobId: string | null) {
  return useQuery({
    queryKey: ADMIN_MOCK_LIFECYCLE_KEYS.status(jobId ?? "none"),
    queryFn: () => getAdminMockLifecycleStatus({ jobId: jobId! }),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.job.status;
      return status === "RUNNING" || status === "QUEUED" ? 2500 : false;
    },
    refetchIntervalInBackground: false,
  });
}

export function useAdminMockLifecycleReport(jobId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ADMIN_MOCK_LIFECYCLE_KEYS.report(jobId ?? "none"),
    queryFn: () => getAdminMockLifecycleReport({ jobId: jobId! }),
    enabled: Boolean(jobId) && enabled,
    staleTime: 60000,
  });
}

export function useRunAdminMockLifecycle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Parameters<typeof postAdminMockLifecycleRun>[0]) =>
      postAdminMockLifecycleRun(input),
    onSuccess: (data) => {
      toast.success(`Lifecycle suite started: ${data.job.jobId}`);
      queryClient.invalidateQueries({ queryKey: ADMIN_MOCK_LIFECYCLE_KEYS.all });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to start lifecycle suite";
      toast.error(message);
    },
  });
}
