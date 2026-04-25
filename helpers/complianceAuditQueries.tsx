import { useQuery } from "@tanstack/react-query";
import { 
  getComplianceAudits, 
  InputType, 
  OutputType, 
  ComplianceAuditWithDetails 
} from "../endpoints/packet/compliance-audit_GET.schema";

export type { ComplianceAuditWithDetails, InputType as ComplianceAuditFilters };

export const COMPLIANCE_AUDIT_QUERY_KEY = ["packet", "compliance-audit"] as const;

export const useComplianceAudit = (params: InputType = { limit: 50, offset: 0 }) => {
  return useQuery({
    queryKey: [...COMPLIANCE_AUDIT_QUERY_KEY, params],
    queryFn: () => getComplianceAudits(params),
    placeholderData: (prev) => prev,
    refetchInterval: 30000, // Refetch every 30 seconds
  });
};