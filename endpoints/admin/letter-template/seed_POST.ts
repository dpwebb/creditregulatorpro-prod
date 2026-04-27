import { OutputType } from "./seed_POST.schema";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { db } from "../../../helpers/db";
import { handleEndpointError } from "../../../helpers/endpointErrorHandler";
import { LetterTemplateCategory } from "../../../helpers/schema";
import superjson from "superjson";

// Helper to convert snake_case to Title Case
function toTitleCase(str: string): string {
  return str
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      return new Response(superjson.stringify({ error: "Admin privileges required" }), { status: 403 });
    }

    const templatesToSeed: { category: LetterTemplateCategory; key: string; label: string }[] = [];

    const bureaus = ["equifax", "transunion", "generic"];
    for (const b of bureaus) {
      templatesToSeed.push({ category: "bureau", key: b, label: toTitleCase(b) });
    }

    const provincials = [
      "ontario_cra", "nova_scotia_cra", "bc_cra", "new_brunswick_cra", 
      "pei_cra", "manitoba_cpa", "yukon_cpa", "nwt_cpa", "nunavut_cpa", 
      "saskatchewan_cpbpa", "nl_cpbpa", "quebec_a82", "alberta_pipa"
    ];
    for (const p of provincials) {
      templatesToSeed.push({ category: "provincial", key: p, label: toTitleCase(p) });
    }

    const violations = [
      "statute_of_limitations", "bankruptcy_discharge_violation", "identity_theft_violation", 
      "documentation_chain_failure", "balance_calculation_violation", "bureau_investigation_failure", 
      "bureau_notification_failure", "bureau_dispute_marking_failure", "bureau_reinsertion_violation", 
      "bureau_access_violation", "furnisher_reaging_violation", "temporal_manipulation", 
      "account_status_inconsistency", "furnisher_status_code_mismatch", "collector_license_failure", 
      "collector_unauthorized_fees", "collector_duplicate_reporting", "collector_payment_acknowledgment_violation", 
      "response_mov_missing", "response_incomplete", "response_no_documentation", "response_address_mismatch", 
      "response_unauthorized", "disclosure_deficiency", "cross_entity_discrepancy", "multiple_collector_violation", 
      "phantom_debt_unverifiable", "zombie_debt_resurrection", "stale_reporting_failure", "credit_limit_manipulation", 
      "closed_account_balance_inflation", "last_activity_date_manipulation", "consumer_statement_suppression", 
      "retroactive_history_manipulation", "payment_history_manipulation", "investigation_rubber_stamp", 
      "furnisher_joint_account_violation", "furnisher_authorized_user_misrepresentation", "furnisher_post_dispute_retaliation", 
      "collector_statute_revival_attempt"
    ];
    for (const v of violations) {
      templatesToSeed.push({ category: "violation_narrative", key: v, label: toTitleCase(v) });
    }

    let seededCount = 0;

    for (const t of templatesToSeed) {
      const existing = await db
        .selectFrom("letterTemplate")
        .select("id")
        .where("category", "=", t.category)
        .where("templateKey", "=", t.key)
        .executeTakeFirst();

      if (!existing) {
        await db.insertInto("letterTemplate").values({
          category: t.category,
          templateKey: t.key,
          label: t.label,
          isActive: true,
          updatedBy: user.id
        }).execute();
        seededCount++;
      }
    }

    return new Response(superjson.stringify({ ok: true, seeded: seededCount } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}