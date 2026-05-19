import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getResponseList,
  type InputType as ResponseDocumentListInput,
} from "../endpoints/responses/list_GET.schema";
import {
  getResponseDocument,
  type InputType as ResponseDocumentGetInput,
} from "../endpoints/responses/get_GET.schema";
import {
  postResponseAdminReview,
  type InputType as ResponseAdminReviewInput,
  type OutputType as ResponseAdminReviewOutput,
} from "../endpoints/responses/admin-review_POST.schema";
import {
  getResponseProcessingMetrics,
  type InputType as ResponseProcessingMetricsInput,
} from "../endpoints/responses/metrics_GET.schema";

export const RESPONSE_DOCUMENTS_QUERY_KEY = ["responses", "documents"] as const;
export const RESPONSE_DOCUMENT_QUERY_KEY = ["responses", "document"] as const;
export const RESPONSE_PROCESSING_METRICS_QUERY_KEY = ["responses", "processing-metrics"] as const;
export const RESPONSE_DOCUMENT_ADMIN_REVIEW_MUTATION_KEY = ["responses", "admin-review"] as const;

export function useResponseDocuments(filters?: ResponseDocumentListInput) {
  return useQuery({
    queryKey: [...RESPONSE_DOCUMENTS_QUERY_KEY, filters],
    queryFn: () => getResponseList(filters),
    placeholderData: (previousData) => previousData,
  });
}

export function useResponseDocument(responseId?: ResponseDocumentGetInput["responseId"] | null) {
  return useQuery({
    queryKey: [...RESPONSE_DOCUMENT_QUERY_KEY, responseId],
    queryFn: () => getResponseDocument({ responseId: responseId as number }),
    enabled: Number.isInteger(responseId) && Number(responseId) > 0,
  });
}

export function useResponseProcessingMetrics(filters?: ResponseProcessingMetricsInput) {
  return useQuery({
    queryKey: [...RESPONSE_PROCESSING_METRICS_QUERY_KEY, filters],
    queryFn: () => getResponseProcessingMetrics(filters),
    placeholderData: (previousData) => previousData,
  });
}

export function useResponseDocumentAdminReviewMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: RESPONSE_DOCUMENT_ADMIN_REVIEW_MUTATION_KEY,
    mutationFn: (input: ResponseAdminReviewInput) => postResponseAdminReview(input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: RESPONSE_DOCUMENTS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: [...RESPONSE_DOCUMENT_QUERY_KEY, variables.responseId] });
      void queryClient.invalidateQueries({ queryKey: RESPONSE_PROCESSING_METRICS_QUERY_KEY });
    },
  });
}

export type {
  ResponseDocumentListInput,
  ResponseDocumentGetInput,
  ResponseProcessingMetricsInput,
  ResponseAdminReviewInput,
  ResponseAdminReviewOutput,
};
