import { useQuery } from "@tanstack/react-query";
import {
  getComplianceCalendar,
  OutputType,
} from "../endpoints/packet/compliance-calendar_GET.schema";

export const COMPLIANCE_CALENDAR_QUERY_KEY = [
  "packet",
  "compliance-calendar",
] as const;

export function useComplianceCalendar() {
  return useQuery<OutputType, Error>({
    queryKey: COMPLIANCE_CALENDAR_QUERY_KEY,
    queryFn: async () => {
      return await getComplianceCalendar();
    },
  });
}