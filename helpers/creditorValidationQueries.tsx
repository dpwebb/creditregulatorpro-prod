import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { CraObligationTypeArrayValues, ObligationStateArrayValues } from "./schema";
import { getCreditorValidationList, ObligationTestWithDetails, InputType } from "../endpoints/creditor-validation/list_GET.schema";
import { createCreditorValidation } from "../endpoints/creditor-validation/create_POST.schema";
import { updateCreditorValidation } from "../endpoints/creditor-validation/update_POST.schema";
import { deleteCreditorValidation } from "../endpoints/creditor-validation/delete_POST.schema";

// --- Types & Schemas ---

// Use the type from the endpoint schema
export type CreditorObligationTestDto = ObligationTestWithDetails;

// Schema for creating/updating an obligation test
export const CreditorObligationTestSchema = z.object({
  creditorId: z.number().nullable().optional(),
  obligationType: z.enum(CraObligationTypeArrayValues),
  obligationState: z.enum(ObligationStateArrayValues).nullable().optional(),
  obligationSequence: z.number().nullable().optional(),
  disputeVector: z.string().nullable().optional(),
  lastChallengeDate: z.string().nullable().optional(), // ISO string for date
  lastTestDate: z.string().nullable().optional(), // ISO string for date
  responseDeadline: z.string().nullable().optional(), // ISO string for date
  responsesReceived: z.number().nullable().optional(),
  metro2Version: z.string().nullable().optional(),
  statutoryBasis: z.string().nullable().optional(),
  omissions: z.string().nullable().optional(),
  validationStatus: z.string().nullable().optional(),
  escalationPath: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type CreditorObligationTestInput = z.infer<typeof CreditorObligationTestSchema>;

// --- React Query Hooks ---

export const useCreditorValidationList = (creditorId?: number, obligationState?: InputType['obligationState'], tradelineId?: number) => {
  return useQuery({
    queryKey: ["creditorValidations", creditorId, obligationState, tradelineId],
    queryFn: () => getCreditorValidationList({ creditorId, obligationState, tradelineId }),
  });
};

export const useCreateCreditorValidation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCreditorValidation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creditorValidations"] });
    },
  });
};

export const useUpdateCreditorValidation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateCreditorValidation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creditorValidations"] });
    },
  });
};

export const useDeleteCreditorValidation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCreditorValidation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creditorValidations"] });
    },
  });
};