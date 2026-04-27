import { useQuery } from "@tanstack/react-query";
import { postValidatePublish } from "../endpoints/version/validate-publish_POST.schema";

export const VALIDATE_PUBLISH_QUERY_KEY = (versionId: number) => ["validatePublish", versionId];

export function useValidatePublish(versionId: number, enabled: boolean = false) {
  return useQuery({
    queryKey: VALIDATE_PUBLISH_QUERY_KEY(versionId),
    queryFn: () => postValidatePublish({ versionId }),
    enabled: enabled && !!versionId,
    staleTime: 0, // We want fresh data each time the dialog is opened
  });
}