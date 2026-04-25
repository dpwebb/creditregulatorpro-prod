import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getBankruptcyList, InputType as ListInput, BankruptcyRecordWithDetails } from "../endpoints/bankruptcy/list_GET.schema";
import { postBankruptcyCreate, InputType as CreateInput } from "../endpoints/bankruptcy/create_POST.schema";
import { postBankruptcyUpdate, InputType as UpdateInput } from "../endpoints/bankruptcy/update_POST.schema";
import { postBankruptcyDelete, InputType as DeleteInput } from "../endpoints/bankruptcy/delete_POST.schema";
import { isEligibleForRemoval } from "./bankruptcyRules";
import { differenceInDays, startOfDay } from "./dateUtils";

// --- Types ---

export type BankruptcyRecordEnhanced = BankruptcyRecordWithDetails & {
  isEligibleForRemoval: boolean;
  daysUntilRemoval: number | null;
};

// --- Hooks ---

export const useBankruptcyList = (filters?: ListInput) => {
  return useQuery({
    queryKey: ["bankruptcyRecords", filters],
    queryFn: async () => {
      const data = await getBankruptcyList(filters);
      
      // Enhance data with client-side calculations
      const enhancedRecords: BankruptcyRecordEnhanced[] = data.records.map((record) => {
        const eligible = isEligibleForRemoval(record);
        let daysRemaining: number | null = null;
        
        if (record.expectedRemovalDate) {
          const today = startOfDay(new Date());
          // If date is far future (indefinite), treat as null for countdown
          if (record.expectedRemovalDate.getFullYear() < 9000) {
             daysRemaining = differenceInDays(record.expectedRemovalDate, today);
          }
        }

        return {
          ...record,
          isEligibleForRemoval: eligible,
          daysUntilRemoval: daysRemaining,
        };
      });

      return { records: enhancedRecords };
    },
  });
};

export const useCreateBankruptcy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateInput) => postBankruptcyCreate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bankruptcyRecords"] });
      // Also invalidate dashboard stats if they track bankruptcy counts
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    },
  });
};

export const useUpdateBankruptcy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateInput) => postBankruptcyUpdate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bankruptcyRecords"] });
    },
  });
};

export const useDeleteBankruptcy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DeleteInput) => postBankruptcyDelete(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bankruptcyRecords"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    },
  });
};