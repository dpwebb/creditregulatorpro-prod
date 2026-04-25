import { useMutation } from "@tanstack/react-query";
import { postAnonymousReport, InputType, OutputType } from "../endpoints/ingest/anonymous-report_POST.schema";

export function useAnonymousUpload() {
  return useMutation<OutputType, Error, InputType>({
    mutationFn: (data) => postAnonymousReport(data),
  });
}