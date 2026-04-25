import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getLetterTemplates, InputType as GetInput } from "../endpoints/admin/letter-templates_GET.schema";
import { postLetterTemplate, InputType as PostInput } from "../endpoints/admin/letter-template_POST.schema";
import { postDeleteLetterTemplate } from "../endpoints/admin/letter-template/delete_POST.schema";
import { postSeedLetterTemplates } from "../endpoints/admin/letter-template/seed_POST.schema";
import { toast } from "sonner";

export const LETTER_TEMPLATES_QUERY_KEY = ["letterTemplates"];

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
      toast.success("Letter template deleted");
    },
    onError: (error) => {
      toast.error(`Failed to delete letter template: ${error.message}`);
    },
  });
}

export function useSeedLetterTemplates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => postSeedLetterTemplates(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: LETTER_TEMPLATES_QUERY_KEY });
      if (data.seeded > 0) {
        toast.success(`Seeded ${data.seeded} new templates`);
      } else {
        toast.info("No new templates needed to be seeded");
      }
    },
    onError: (error) => {
      toast.error(`Failed to seed letter templates: ${error.message}`);
    },
  });
}