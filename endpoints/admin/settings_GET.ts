import { schema, OutputType } from "./settings_GET.schema";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";


const NON_SENSITIVE_SETTING_KEYS: string[] = [
  "production_mode",
  "postgrid_base_cost",
  "postgrid_surcharge_rate",
  "postgrid_first_class_base_cost",
  "subscription_monthly_price_cad",
  "subscription_annual_price_cad",
];

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    let query = db.selectFrom("systemSettings").selectAll().orderBy("key");

    if (user.role !== "admin") {
      query = query.where("key", "in", NON_SENSITIVE_SETTING_KEYS);
    }

    const settings = await query.execute();

    return new Response(JSON.stringify(settings satisfies OutputType));
  } catch (error) {
    console.error("Error fetching system settings:", error);
    return handleEndpointError(error);
  }
}