import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getStatuteList, InputType as ListInput } from "../endpoints/statute/list_GET.schema";
import { getStatuteFilterOptions } from "../endpoints/statute/filter-options_GET.schema";
import { postStatuteCreate, InputType as CreateInput } from "../endpoints/statute/create_POST.schema";
import { postStatuteUpdate, InputType as UpdateInput } from "../endpoints/statute/update_POST.schema";
import { postStatuteDelete, InputType as DeleteInput } from "../endpoints/statute/delete_POST.schema";
import { getStatuteHistory } from "../endpoints/statute/history_GET.schema";
import { searchLegalAuthority, InputType as LegalAuthoritySearchInput } from "../endpoints/legal-authority/search_GET.schema";

export const useStatutes = (filters?: ListInput) => {
  return useQuery({
    queryKey: ["statutes", filters],
    queryFn: () => getStatuteList(filters),
  });
};

export const useCreateStatute = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateInput) => postStatuteCreate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["statutes"] });
      queryClient.invalidateQueries({ queryKey: ["statute-filter-options"] });
    },
  });
};

export const useUpdateStatute = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateInput) => postStatuteUpdate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["statutes"] });
      queryClient.invalidateQueries({ queryKey: ["statute-filter-options"] });
    },
  });
};

export const useDeleteStatute = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DeleteInput) => postStatuteDelete(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["statutes"] });
      queryClient.invalidateQueries({ queryKey: ["statute-filter-options"] });
    },
  });
};

export const useStatuteFilterOptions = () => {
  return useQuery({
    queryKey: ["statute-filter-options"],
    queryFn: () => getStatuteFilterOptions(),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
};

export const useStatuteHistory = (versionId?: number) => {
  return useQuery({
    queryKey: ["statute-history", versionId],
    queryFn: () => getStatuteHistory({ versionId: versionId as number }),
    enabled: typeof versionId === "number" && Number.isFinite(versionId),
  });
};

export const useLegalAuthoritySearch = (filters?: LegalAuthoritySearchInput) => {
  const hasFilter = Boolean(
    filters?.query ||
      filters?.regulationId ||
      filters?.violationCategory ||
      filters?.fieldName ||
      filters?.jurisdiction ||
      filters?.supportLevel
  );

  return useQuery({
    queryKey: ["legal-authority-search", filters],
    queryFn: () => searchLegalAuthority(filters),
    enabled: hasFilter,
  });
};
