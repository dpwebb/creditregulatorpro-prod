import { z } from "zod";


export const schema = z.object({});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  totals: {
    transactionCount: number;
    totalRevenue: number;
    totalPostGridCost: number;
    totalMarkup: number;
    refundCount: number;
    refundTotal: number;
  };
  byMailType: {
    firstClass: {
      count: number;
      revenue: number;
      cost: number;
      markup: number;
    };
    registered: {
      count: number;
      revenue: number;
      cost: number;
      markup: number;
    };
  };
  byPeriod: {
    last30Days: { count: number; revenue: number; markup: number };
    last90Days: { count: number; revenue: number; markup: number };
    allTime: { count: number; revenue: number; markup: number };
  };
};

export const getPostalRevenue = async (
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/admin/postal-revenue`, {
    method: "GET",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  
  if (!result.ok) {
    let errorMsg = "Failed to fetch postal revenue";
    try {
      const errorObject = JSON.parse(await result.text());
      if (errorObject.error) errorMsg = errorObject.error;
    } catch (e) {
      // Ignore parse error
    }
    throw new Error(errorMsg);
  }
  
  return JSON.parse(await result.text());
};