import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postExtract, InputType as ExtractInput, OutputType as ExtractOutput } from "../endpoints/ocr/extract_POST.schema";
import { postApprove, InputType as ApproveInput, OutputType as ApproveOutput } from "../endpoints/review/approve_POST.schema";
import { postReject, InputType as RejectInput, OutputType as RejectOutput } from "../endpoints/review/reject_POST.schema";
import { toast } from "sonner";

// Re-defining types locally since we don't have access to the helper files in this context
// In a real scenario, these would be imported from helpers/reportParser and helpers/confidenceScorer
export interface ParsedTradeline {
  accountNumber?: string;
  creditorName: string;
  accountType: string;
  balance: number;
  status: string;
  dates: {
    opened?: Date | null;
    reported?: Date | null;
    closed?: Date | null;
    dofd?: Date | null;
    [key: string]: any;
  };
  amounts: {
    high?: number;
    pastDue?: number;
    [key: string]: any;
  };
  remarkCodes: string[];
}

export interface ScoredTradeline extends ParsedTradeline {
  confidence: {
    accountNumber: number;
    creditorName: number;
    accountType: number;
    balance: number;
    status: number;
    dates: {
      opened: number;
      reported: number;
      closed: number;
      dofd: number;
    };
    amounts: {
      high: number;
      pastDue: number;
    };
    remarkCodes: number;
    overall: number;
  };
}

export const OCR_KEYS = {
  all: ["ocr"] as const,
  extract: () => [...OCR_KEYS.all, "extract"] as const,
};

export function useExtractOCR() {
  return useMutation<ExtractOutput, Error, ExtractInput>({
    mutationFn: (data) => postExtract(data),
    onError: (error) => {
      toast.error(`Extraction failed: ${error.message}`);
    },
  });
}

export function useApproveReview() {
  const queryClient = useQueryClient();

  return useMutation<ApproveOutput, Error, ApproveInput>({
    mutationFn: (data) => postApprove(data),
    onSuccess: () => {
      toast.success("Review approved and saved successfully");
      queryClient.invalidateQueries({ queryKey: OCR_KEYS.all });
      // Invalidate artifacts list as a new one is created
      queryClient.invalidateQueries({ queryKey: ["artifacts"] });
      queryClient.invalidateQueries({ queryKey: ["tradelines"] });
    },
    onError: (error) => {
      toast.error(`Approval failed: ${error.message}`);
    },
  });
}

export function useRejectReview() {
  const queryClient = useQueryClient();

  return useMutation<RejectOutput, Error, RejectInput>({
    mutationFn: (data) => postReject(data),
    onSuccess: () => {
      toast.success("Review rejected");
      queryClient.invalidateQueries({ queryKey: OCR_KEYS.all });
    },
    onError: (error) => {
      toast.error(`Rejection failed: ${error.message}`);
    },
  });
}
