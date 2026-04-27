import { useMutation } from "@tanstack/react-query";
import { postSemanticAudit, InputType } from "../endpoints/admin/diagnostic/semantic-audit_POST.schema";
import { toast } from "sonner";

export function useSemanticAudit() {
  return useMutation({
    mutationFn: async (input: InputType) => {
      return postSemanticAudit(input);
    },
    onSuccess: (data) => {
      toast.success(`Semantic audit completed. Passed: ${data.passed}, Failed: ${data.failed}`);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to run semantic audit";
      toast.error(message);
    },
  });
}