export const SUBSCRIPTION_MONTHLY_PRICE_CAD = 19.95;
export const SUBSCRIPTION_ANNUAL_PRICE_CAD = 49.95;

const LEGACY_MONTHLY_PRICE_CENTS = new Set([499, 1900]);
const LEGACY_ANNUAL_PRICE_CENTS = new Set([4999, 19000]);

export function resolveSubscriptionPriceCad(
  configuredValue: string | null | undefined,
  plan: "monthly" | "annual"
): number {
  const fallback =
    plan === "monthly"
      ? SUBSCRIPTION_MONTHLY_PRICE_CAD
      : SUBSCRIPTION_ANNUAL_PRICE_CAD;

  if (!configuredValue) {
    return fallback;
  }

  const parsed = Number.parseFloat(configuredValue);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const cents = Math.round(parsed * 100);
  const legacyPrices =
    plan === "monthly" ? LEGACY_MONTHLY_PRICE_CENTS : LEGACY_ANNUAL_PRICE_CENTS;

  return legacyPrices.has(cents) ? fallback : parsed;
}
