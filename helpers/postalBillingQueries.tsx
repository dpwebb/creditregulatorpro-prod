import { useQuery } from "@tanstack/react-query";
import { getPostalTransactions } from "../endpoints/postal/transactions_GET.schema";
export { usePostalPricing } from "./useSystemSettings";
export { usePostalRevenue } from "./usePostalRevenue";

export const POSTGRID_BASE_COST = 4.99;
export const POSTGRID_SURCHARGE_RATE = 0.10;
export const POSTGRID_TOTAL_COST = 5.49;
export const POSTGRID_FIRST_CLASS_COST = 2.90;

export const POSTAL_TRANSACTIONS_QUERY_KEY = ["postal-transactions"] as const;

export function usePostalTransactions() {
  return useQuery({
    queryKey: POSTAL_TRANSACTIONS_QUERY_KEY,
    queryFn: () => getPostalTransactions(),
  });
}