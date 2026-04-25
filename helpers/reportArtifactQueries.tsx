import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getReportArtifactList as fetchList } from "../endpoints/report-artifact/list_GET.schema";
import { postReportArtifactCreate as createArtifact, InputType as CreateInput } from "../endpoints/report-artifact/create_POST.schema";
import { postReportArtifactUpdate as updateArtifact, InputType as UpdateInput } from "../endpoints/report-artifact/update_POST.schema";
import { postReportArtifactDelete as deleteArtifact, InputType as DeleteInput } from "../endpoints/report-artifact/delete_POST.schema";

export const useReportArtifactList = () => {
  return useQuery({
    queryKey: ["reportArtifacts"],
    queryFn: () => fetchList(),
  });
};

export const useCreateReportArtifact = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateInput) => createArtifact(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reportArtifacts"] });
      queryClient.invalidateQueries({ queryKey: ["tradelines"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
      queryClient.invalidateQueries({ queryKey: ["packets"] });
    },
  });
};

export const useUpdateReportArtifact = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateInput) => updateArtifact(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reportArtifacts"] });
    },
  });
};

export const useDeleteReportArtifact = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DeleteInput) => deleteArtifact(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reportArtifacts"] });
    },
  });
};