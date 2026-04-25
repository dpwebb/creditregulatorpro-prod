import { db } from "./db";

export async function getPostalPricingFromDB() {
  const defaultBaseCost = 4.99;
  const defaultSurchargeRate = 0.10;

  try {
    const settings = await db
      .selectFrom("systemSettings")
      .select(["key", "value"])
      .where("key", "in", ["postgrid_base_cost", "postgrid_surcharge_rate", "postgrid_first_class_base_cost"])
      .execute();

    const baseCostSetting = settings.find((s) => s.key === "postgrid_base_cost");
    const surchargeSetting = settings.find((s) => s.key === "postgrid_surcharge_rate");
    const firstClassBaseCostSetting = settings.find((s) => s.key === "postgrid_first_class_base_cost");

    const baseCost = baseCostSetting && !isNaN(parseFloat(baseCostSetting.value))
      ? parseFloat(baseCostSetting.value)
      : defaultBaseCost;

    const surchargeRate = surchargeSetting && !isNaN(parseFloat(surchargeSetting.value))
      ? parseFloat(surchargeSetting.value)
      : defaultSurchargeRate;

    const defaultFirstClassBaseCost = 2.90;
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
    };
  } catch (error) {
    console.error("Failed to query postal pricing from DB:", error);
    const defaultFirstClassBaseCost = 2.90;
    const totalCost = defaultBaseCost + (defaultBaseCost * defaultSurchargeRate);
    return {
      baseCost: defaultBaseCost,
      surchargeRate: defaultSurchargeRate,
      totalCost,
      registeredCost: parseFloat((totalCost * 1.15).toFixed(2)),
      firstClassBaseCost: defaultFirstClassBaseCost,
      firstClassCost: parseFloat((defaultFirstClassBaseCost * 1.15).toFixed(2)),
    };
  }
}