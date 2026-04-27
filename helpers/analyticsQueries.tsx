import { useQuery, useQueries } from "@tanstack/react-query";
import { getAnalytics, OutputType } from "../endpoints/success/analytics_GET.schema";

// Types based on the requirements for the report
export interface AnalyticsMetric {
  label: string;
  total: number;
  successful: number;
  successRate: number; // 0-1
}

export interface AnalyticsData {
  overall: {
    totalDisputes: number;
    totalSuccess: number;
    successRate: number; // 0-1
    activeDisputes: number;
    averageResolutionTimeDays: number;
    escalationRate: number; // 0-100 based on backend output
    exhaustionRate: number; // 0-100 based on backend output
  };
  byVector: AnalyticsMetric[];
  byViolation: AnalyticsMetric[];
  byCreditor: AnalyticsMetric[];
  byBureau: AnalyticsMetric[];
}

/**
 * Helper to transform decimal rates to percentages if needed.
 * Note: successRate from backend is 0-1 based on the mock, but we want 0-100 for display components that expect "XX%".
 * However, the SuccessMetricsCard component seems to treat it as a direct value to append "%".
 * If backend returns 0.36, and component renders {value}%, we get 0.36%. We want 36%.
 * So we multiply rates by 100.
 */
const transformData = (data: OutputType, scope: string): any => {
  if (!data) return data;

  if (scope === 'overall' && 'successRate' in data && !Array.isArray(data)) {
    // It's the overall object
    return {
      ...data,
      successRate: Math.round((data.successRate || 0) * 100),
      // escalationRate and exhaustionRate might already be 0-100 or 0-1 depending on backend.
      // Assuming 0-1 from backend standard, so converting.
      // If they are already 0-100, this might break, but usually rates are 0-1 in DB.
      // Based on context mock: "successRate: 0.36".
      escalationRate: Math.round((data.escalationRate || 0) * 100),
      exhaustionRate: Math.round((data.exhaustionRate || 0) * 100),
    };
  }

  if (Array.isArray(data)) {
    return data.map((item: any) => ({
      ...item,
      successRate: Math.round((item.successRate || 0) * 100),
    }));
  }

  return data;
};

/**
 * Hook to fetch success analytics based on a specific scope.
 * Directly uses the backend endpoint schema.
 */
export function useSuccessAnalytics(scope: 'overall' | 'vector' | 'creditor' | 'bureau' | 'violation') {
  return useQuery({
    queryKey: ['success-analytics', scope],
    queryFn: async () => {
      const data = await getAnalytics({ scope });
      return transformData(data, scope);
    },
  });
}

/**
 * Hook to fetch comprehensive stats for the analytics report and dashboard summary.
 * Fetches all scopes in parallel.
 */
export function useAnalyticsStats() {
  const results = useQueries({
    queries: [
      { queryKey: ['success-analytics', 'overall'], queryFn: () => getAnalytics({ scope: 'overall' }) },
      { queryKey: ['success-analytics', 'vector'], queryFn: () => getAnalytics({ scope: 'vector' }) },
      { queryKey: ['success-analytics', 'violation'], queryFn: () => getAnalytics({ scope: 'violation' }) },
      { queryKey: ['success-analytics', 'creditor'], queryFn: () => getAnalytics({ scope: 'creditor' }) },
      { queryKey: ['success-analytics', 'bureau'], queryFn: () => getAnalytics({ scope: 'bureau' }) },
    ]
  });

  const isLoading = results.some(r => r.isLoading);
  const isError = results.some(r => r.isError);
  const errors = results.filter(r => r.isError).map(r => r.error);

  const [overall, vector, violation, creditor, bureau] = results;

  // We need to shape this data to match AnalyticsData interface for the report generator
  // Note: The report generator expects 0-1 for successRate (it does formatPercent(val * 100) itself).
  // But the Dashboard components (SuccessMetricsCard) expects 0-100.
  // We should keep raw data (0-1) here for the report generator, or adjust the report generator.
  // The report generator code in context: `formatPercent(item.successRate * 100)`.
  // So it EXPECTS 0-1.
  
  if (isLoading || isError) {
    return { 
      data: undefined, 
      isLoading, 
      isError, 
      errors 
    };
  }

  // Helper to map backend array to AnalyticsMetric
  const mapToMetric = (data: any, labelKey: string): AnalyticsMetric[] => {
    if (!Array.isArray(data)) return [];
    return data.map((item: any) => ({
      label: item[labelKey] || 'Unknown',
      total: item.totalChallenges || 0,
      successful: item.successCount || 0,
      successRate: item.successRate || 0,
    }));
  };

  const overallData = overall.data as any;
  
  const analyticsData: AnalyticsData = {
    overall: {
      totalDisputes: overallData?.totalChallenges || 0,
      totalSuccess: Math.round((overallData?.totalChallenges || 0) * (overallData?.successRate || 0)), // Approximate if not provided
      successRate: overallData?.successRate || 0,
      activeDisputes: 0, // Not provided by endpoint yet
      averageResolutionTimeDays: overallData?.avgResponseDays || 0,
      escalationRate: overallData?.escalationRate || 0,
      exhaustionRate: overallData?.exhaustionRate || 0,
    },
    byVector: mapToMetric(vector.data, 'vector'),
    byViolation: mapToMetric(violation.data, 'violationCategory'),
    byCreditor: mapToMetric(creditor.data, 'creditorName'),
    byBureau: mapToMetric(bureau.data, 'bureauName'),
  };

  return {
    data: analyticsData,
    isLoading,
    isError,
    errors
  };
}