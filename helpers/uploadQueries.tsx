import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postReport, InputType as UploadReportInput, OutputType as UploadReportOutput } from "../endpoints/ingest/report_POST.schema";
import { toast } from "sonner";

export type UploadProgressCallback = (stage: string, percent: number, message?: string) => void;

export function useUploadReport(onProgress?: UploadProgressCallback) {
  const queryClient = useQueryClient();

  return useMutation<UploadReportOutput, Error, UploadReportInput>({
    mutationFn: (data) => postReport(data, onProgress),
    onSuccess: () => {
      toast.success("Report uploaded successfully");
      // Invalidate relevant queries to refresh data
      // We invalidate 'evidence' because uploading a report might trigger evidence creation (conceptually)
      // We invalidate 'artifacts' assuming there's a list of artifacts somewhere
      queryClient.invalidateQueries({ queryKey: ["evidence"] });
      queryClient.invalidateQueries({ queryKey: ["artifacts"] });
      queryClient.invalidateQueries({ queryKey: ["tradelines"] }); // New data might affect tradelines
    },
    onError: (error) => {
      console.error("Failed to upload report:", error);
      toast.error(`Upload failed: ${error.message}`);
    },
  });
}