import { OutputType } from "./postal-revenue_GET.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    
    if (user.role !== "admin") {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { 
        status: 403, 
        headers: { "Content-Type": "application/json" } 
      });
    }

    // Fetch all relevant transactions and aggregate them in JS to avoid complex raw SQL 
    // dialect incompatibilities or numeric parsing mismatches.
    const transactions = await db
      .selectFrom("postalTransaction")
      .select([
        "amountCad",
        "baseCostCad",
        "markupCad",
        "status",
        "description",
        "createdAt",
      ])
      .execute();

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const totals = {
      transactionCount: 0,
      totalRevenue: 0,
      totalPostGridCost: 0,
      totalMarkup: 0,
      refundCount: 0,
      refundTotal: 0,
    };

    const firstClass = { count: 0, revenue: 0, cost: 0, markup: 0 };
    const registered = { count: 0, revenue: 0, cost: 0, markup: 0 };

    const last30Days = { count: 0, revenue: 0, markup: 0 };
    const last90Days = { count: 0, revenue: 0, markup: 0 };
    const allTime = { count: 0, revenue: 0, markup: 0 };

    for (const tx of transactions) {
      const amount = parseFloat(tx.amountCad as string) || 0;
      const cost = parseFloat(tx.baseCostCad as string) || 0;
      const markup = parseFloat(tx.markupCad as string) || 0;
      const created = new Date(tx.createdAt);

      if (tx.status === "refunded") {
        totals.refundCount++;
        totals.refundTotal += amount;
      } else if (tx.status === "completed") {
        totals.transactionCount++;
        totals.totalRevenue += amount;
        totals.totalPostGridCost += cost;
        totals.totalMarkup += markup;

        allTime.count++;
        allTime.revenue += amount;
        allTime.markup += markup;

        if (created >= thirtyDaysAgo) {
          last30Days.count++;
          last30Days.revenue += amount;
          last30Days.markup += markup;
        }
        
        if (created >= ninetyDaysAgo) {
          last90Days.count++;
          last90Days.revenue += amount;
          last90Days.markup += markup;
        }

        const descriptionLower = tx.description?.toLowerCase() || "";
        if (descriptionLower.includes("first class")) {
          firstClass.count++;
          firstClass.revenue += amount;
          firstClass.cost += cost;
          firstClass.markup += markup;
        } else if (descriptionLower.includes("registered")) {
          registered.count++;
          registered.revenue += amount;
          registered.cost += cost;
          registered.markup += markup;
        }
      }
    }

    const output: OutputType = {
      totals,
      byMailType: {
        firstClass,
        registered,
      },
      byPeriod: {
        last30Days,
        last90Days,
        allTime,
      },
    };

    return new Response(JSON.stringify(output satisfies OutputType), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}