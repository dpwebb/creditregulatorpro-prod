import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSystemSettings } from "../endpoints/admin/settings_GET.schema";
import { postSystemSettings, InputType } from "../endpoints/admin/settings_POST.schema";
import { toast } from "sonner";

export const SYSTEM_SETTINGS_QUERY_KEY = ["system-settings"] as const;

export function useSystemSettings() {
  return useQuery({
    queryKey: SYSTEM_SETTINGS_QUERY_KEY,
    queryFn: () => getSystemSettings(),
  });
}

export function useUpdateSystemSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: InputType) => postSystemSettings(data),
    onSuccess: () => {
      toast.success("System settings updated successfully");
      queryClient.invalidateQueries({ queryKey: SYSTEM_SETTINGS_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(`Failed to update settings: ${error.message}`);
    },
  });
}

export function useSubscriptionPricing() {
  const { data: settings, isLoading } = useSystemSettings();

  const defaultMonthlyPrice = 4.99;
  const defaultAnnualPrice = 49.99;

  if (isLoading || !settings) {
    return {
      monthlyPrice: defaultMonthlyPrice,
      annualPrice: defaultAnnualPrice,
      isLoading,
    };
  }

  const monthlySetting = settings.find((s) => s.key === "subscription_monthly_price_cad");
  const annualSetting = settings.find((s) => s.key === "subscription_annual_price_cad");

  const monthlyPrice = monthlySetting && !isNaN(parseFloat(monthlySetting.value))
    ? parseFloat(monthlySetting.value)
    : defaultMonthlyPrice;

  const annualPrice = annualSetting && !isNaN(parseFloat(annualSetting.value))
    ? parseFloat(annualSetting.value)
    : defaultAnnualPrice;

  return {
    monthlyPrice,
    annualPrice,
    isLoading,
  };
}

export function usePostalPricing() {
  const { data: settings, isLoading } = useSystemSettings();

  const defaultBaseCost = 4.99;
  const defaultSurchargeRate = 0.10;
  const defaultFirstClassBaseCost = 2.90;

  if (isLoading || !settings) {
    const totalCost = defaultBaseCost + (defaultBaseCost * defaultSurchargeRate);
    return {
      baseCost: defaultBaseCost,
      surchargeRate: defaultSurchargeRate,
      totalCost,
      registeredCost: parseFloat((totalCost * 1.15).toFixed(2)),
      firstClassBaseCost: defaultFirstClassBaseCost,
      firstClassCost: parseFloat((defaultFirstClassBaseCost * 1.15).toFixed(2)),
      isLoading,
    };
  }

  const baseCostSetting = settings.find((s) => s.key === "postgrid_base_cost");
  const surchargeSetting = settings.find((s) => s.key === "postgrid_surcharge_rate");
  const firstClassBaseCostSetting = settings.find((s) => s.key === "postgrid_first_class_base_cost");

  const baseCost = baseCostSetting && !isNaN(parseFloat(baseCostSetting.value))
    ? parseFloat(baseCostSetting.value)
    : defaultBaseCost;

  const surchargeRate = surchargeSetting && !isNaN(parseFloat(surchargeSetting.value))
    ? parseFloat(surchargeSetting.value)
    : defaultSurchargeRate;

  const firstClassBaseCost = firstClassBaseCostSetting && !isNaN(parseFloat(firstClassBaseCostSetting.value))
    ? parseFloat(firstClassBaseCostSetting.value)
    : defaultFirstClassBaseCost;

  const totalCost = baseCost + (baseCost * surchargeRate);

  return {
    baseCost,
    surchargeRate,
    totalCost,
    registeredCost: parseFloat((totalCost * 1.15).toFixed(2)),
    firstClassBaseCost,
    firstClassCost: parseFloat((firstClassBaseCost * 1.15).toFixed(2)),
    isLoading,
  };
}