import { useQuery } from "@tanstack/react-query";

import {
  getResponseList,
  type InputType as ResponseDocumentListInput,
} from "../endpoints/responses/list_GET.schema";
import {
  getResponseDocument,
  type InputType as ResponseDocumentGetInput,
} from "../endpoints/responses/get_GET.schema";

export const RESPONSE_DOCUMENTS_QUERY_KEY = ["responses", "documents"] as const;
export const RESPONSE_DOCUMENT_QUERY_KEY = ["responses", "document"] as const;

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

export type {
  ResponseDocumentListInput,
  ResponseDocumentGetInput,
};
