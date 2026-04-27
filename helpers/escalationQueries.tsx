import { useMutation, useQueryClient } from "@tanstack/react-query";
import { scanEscalations } from "../endpoints/escalation/scan_POST.schema";
import { triggerEscalation, InputType as TriggerInput } from "../endpoints/escalation/trigger_POST.schema";
import { postAutoTriggerEscalation } from "../endpoints/escalation/auto-trigger_POST.schema";
import { toast } from "sonner";

export const useEscalationScanMutation = () => {
  return useMutation({
    mutationFn: () => scanEscalations(),
    onSuccess: (data) => {
      toast.success(`Scan complete. Found ${data.obligationsReadyForEscalation.length} obligations ready for escalation.`);
    },
    onError: (error: Error) => {
      toast.error(`Scan failed: ${error.message}`);
    },
  });
};

export const useTriggerEscalationMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: TriggerInput) => triggerEscalation(data),
    onSuccess: () => {
      toast.success("Escalation triggered successfully");
      // Invalidate obligations and deadlines as escalation affects both
      queryClient.invalidateQueries({ queryKey: ["obligations"] }); 
      queryClient.invalidateQueries({ queryKey: ["deadlines"] });
    },
    onError: (error: Error) => {
      toast.error(`Escalation failed: ${error.message}`);
    },
  });
};

export const useAutoTriggerEscalationMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => postAutoTriggerEscalation(),
    onSuccess: (data) => {
      const { scannedCount, triggeredCount, errors } = data.summary;
      toast.success(
        `Auto-escalation batch complete. Scanned: ${scannedCount}, Triggered: ${triggeredCount}, Errors: ${errors.length}`
      );
      // Invalidate obligations and deadlines as escalation affects both
      queryClient.invalidateQueries({ queryKey: ["obligations"] });
      queryClient.invalidateQueries({ queryKey: ["deadlines"] });
    },
    onError: (error: Error) => {
      toast.error(`Auto-escalation failed: ${error.message}`);
    },
  });
};