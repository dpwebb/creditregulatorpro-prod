import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  getConsumerIdentification,
  OutputType as IdentificationOutput,
} from "../endpoints/user/identification_GET.schema";
import {
  postConsumerIdentification,
  InputType as IdentificationUploadInput,
} from "../endpoints/user/identification_POST.schema";
import { postDeleteConsumerIdentification } from "../endpoints/user/identification/delete_POST.schema";
import { AUTH_QUERY_KEY } from "./useAuth";

export const CONSUMER_IDENTIFICATION_QUERY_KEY = ["user", "identification"] as const;

export function useConsumerIdentification() {
  const queryClient = useQueryClient();

  const identificationQuery = useQuery({
    queryKey: CONSUMER_IDENTIFICATION_QUERY_KEY,
    queryFn: () => getConsumerIdentification(),
    staleTime: 1000 * 60 * 5,
  });

  const invalidateIdentityState = () => {
    queryClient.invalidateQueries({ queryKey: CONSUMER_IDENTIFICATION_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
  };

  const uploadMutation = useMutation({
    mutationFn: (input: IdentificationUploadInput) => postConsumerIdentification(input),
    onSuccess: (data: IdentificationOutput) => {
      queryClient.setQueryData(CONSUMER_IDENTIFICATION_QUERY_KEY, data);
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
      toast.success("Identification saved");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to save identification");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => postDeleteConsumerIdentification(),
    onSuccess: () => {
      queryClient.setQueryData(CONSUMER_IDENTIFICATION_QUERY_KEY, { identification: null });
      invalidateIdentityState();
      toast.success("Identification deleted");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete identification");
    },
  });

  return {
    identification: identificationQuery.data?.identification ?? null,
    isLoading: identificationQuery.isLoading,
    error: identificationQuery.error,
    uploadIdentification: uploadMutation.mutateAsync,
    isUploading: uploadMutation.isPending,
    deleteIdentification: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}
