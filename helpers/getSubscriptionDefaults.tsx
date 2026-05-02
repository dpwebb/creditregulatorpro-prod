import { db } from "./db";

/**
 * Returns subscription default values based on the system's production_mode setting.
 * In production mode: trialing plan with 7-day trial end.
 * Outside production mode: active Trial User plan with 100-year trial end (for testing).
 */
export async function getSubscriptionDefaults(now: Date): Promise<{
  plan: "beta";
  status: "trialing" | "active";
  trialStart: Date;
  trialEnd: Date;
}> {
  const productionModeSetting = await db
    .selectFrom("systemSettings")
    .select(["value"])
    .where("key", "=", "production_mode")
    .executeTakeFirst();

  const isProductionMode = productionModeSetting?.value === "true";
  console.log("production_mode setting:", productionModeSetting?.value, "→ isProductionMode:", isProductionMode);

  if (isProductionMode) {
    const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
    return {
      plan: "beta",
      status: "trialing",
      trialStart: now,
      trialEnd,
    };
  } else {
    const trialEnd = new Date(now.getTime() + 100 * 365 * 24 * 60 * 60 * 1000); // 100 years
    return {
      plan: "beta",
      status: "active",
      trialStart: now,
      trialEnd,
    };
  }
}
