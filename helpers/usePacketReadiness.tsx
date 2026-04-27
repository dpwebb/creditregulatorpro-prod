import { useMutation } from "@tanstack/react-query";
import {
  postValidateReadiness,
  InputType,
  OutputType,
} from "../endpoints/packet/validate-readiness_POST.schema";

export const usePacketReadiness = () => {
  return useMutation<OutputType, Error, InputType>({
    mutationFn: async (data) => {
      return await postValidateReadiness(data);
    },
  });
};