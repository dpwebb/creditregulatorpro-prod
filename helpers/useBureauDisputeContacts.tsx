import { useQuery } from "@tanstack/react-query";
import { getBureauDisputeContacts } from "../endpoints/bureau/dispute-contacts_GET.schema";

export const BUREAU_DISPUTE_CONTACTS_QUERY_KEY = ["bureau", "dispute-contacts"] as const;

export function useBureauDisputeContacts() {
  return useQuery({
    queryKey: BUREAU_DISPUTE_CONTACTS_QUERY_KEY,
    queryFn: async () => {
      const result = await getBureauDisputeContacts();
      return result.bureaus;
    },
    staleTime: 1000 * 60 * 60, // Cache for 1 hour since these addresses rarely change
  });
}