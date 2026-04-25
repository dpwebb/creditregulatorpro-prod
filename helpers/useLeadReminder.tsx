import { useMutation } from "@tanstack/react-query";
import { postLeadReminder } from "../endpoints/lead/reminder_POST.schema";

export function useLeadReminder() {
  return useMutation({
    mutationFn: postLeadReminder,
  });
}