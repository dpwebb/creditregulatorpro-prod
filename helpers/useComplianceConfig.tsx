import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getComplianceConfigs } from "../endpoints/admin/compliance-config_GET.schema";
import { postComplianceConfigs, InputType } from "../endpoints/admin/compliance-config_POST.schema";
import { toast } from "sonner";

export const COMPLIANCE_CONFIG_QUERY_KEY = ["admin", "compliance-config"] as const;

export function useComplianceConfigs() {
  return useQuery({
    queryKey: COMPLIANCE_CONFIG_QUERY_KEY,
    queryFn: () => getComplianceConfigs(),
  });
}

export function useUpdateComplianceConfigs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: InputType) => postComplianceConfigs(data),
    onSuccess: () => {
      toast.success("Compliance configurations updated successfully");
      queryClient.invalidateQueries({ queryKey: COMPLIANCE_CONFIG_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(`Failed to update configurations: ${error.message}`);
    },
  });
}