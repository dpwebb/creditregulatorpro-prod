import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getLetterTemplates, InputType as GetInput } from "../endpoints/admin/letter-templates_GET.schema";
import { postLetterTemplate, InputType as PostInput } from "../endpoints/admin/letter-template_POST.schema";
import { postDeleteLetterTemplate } from "../endpoints/admin/letter-template/delete_POST.schema";
import { postSeedLetterTemplates } from "../endpoints/admin/letter-template/seed_POST.schema";
import { getLetterTemplateHistory } from "../endpoints/admin/letter-template/history_GET.schema";
import { postRollbackLetterTemplate } from "../endpoints/admin/letter-template/rollback_POST.schema";
import { toast } from "sonner";

export const LETTER_TEMPLATES_QUERY_KEY = ["letterTemplates"];
export const LETTER_TEMPLATE_HISTORY_QUERY_KEY = ["letterTemplateHistory"];

export function useLetterTemplates(query: GetInput = {}) {
  return useQuery({
    queryKey: [...LETTER_TEMPLATES_QUERY_KEY, query],
    queryFn: () => getLetterTemplates(query),
  });
}

export function useUpsertLetterTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PostInput) => postLetterTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LETTER_TEMPLATES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: LETTER_TEMPLATE_HISTORY_QUERY_KEY });
      toast.success("Letter template saved successfully");
    },
    onError: (error) => {
      toast.error(`Failed to save letter template: ${error.message}`);
    },
  });
}

export function useDeleteLetterTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => postDeleteLetterTemplate({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LETTER_TEMPLATES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: LETTER_TEMPLATE_HISTORY_QUERY_KEY });
      toast.success("Letter template archived");
    },
    onError: (error) => {
      toast.error(`Failed to archive letter template: ${error.message}`);
    },
  });
}

export function useSeedLetterTemplates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => postSeedLetterTemplates(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: LETTER_TEMPLATES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: LETTER_TEMPLATE_HISTORY_QUERY_KEY });
      if (data.seeded > 0 || data.updated > 0) {
        toast.success(`Prepopulated ${data.seeded + data.updated} letter templates`);
      } else {
        toast.info("Letter templates are already prepopulated");
      }
    },
    onError: (error) => {
      toast.error(`Failed to seed letter templates: ${error.message}`);
    },
  });
}

export function useLetterTemplateHistory(templateId?: number) {
  return useQuery({
    queryKey: [...LETTER_TEMPLATE_HISTORY_QUERY_KEY, templateId],
    queryFn: () => getLetterTemplateHistory({ templateId: templateId as number }),
    enabled: typeof templateId === "number" && Number.isFinite(templateId),
  });
}

export function useRollbackLetterTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof postRollbackLetterTemplate>[0]) =>
      postRollbackLetterTemplate(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LETTER_TEMPLATES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: LETTER_TEMPLATE_HISTORY_QUERY_KEY });
      toast.success("Template rolled back successfully");
    },
    onError: (error) => {
      toast.error(`Failed to rollback template: ${error.message}`);
    },
  });
}
