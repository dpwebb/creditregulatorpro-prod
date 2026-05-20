import { useQuery } from "@tanstack/react-query";

import {
  getAdminIngestQueue,
  type InputType as AdminIngestQueueInput,
} from "../endpoints/admin/ingest-queue_GET.schema";

export const ADMIN_INGEST_PROCESSING_QUEUE_QUERY_KEY = ["admin", "ingest-processing-queue"] as const;

export function useAdminIngestProcessingQueue(filters?: AdminIngestQueueInput) {
  return useQuery({
    queryKey: [...ADMIN_INGEST_PROCESSING_QUEUE_QUERY_KEY, filters],
    queryFn: () => getAdminIngestQueue(filters),
    placeholderData: (previousData) => previousData,
  });
}

export type { AdminIngestQueueInput };
