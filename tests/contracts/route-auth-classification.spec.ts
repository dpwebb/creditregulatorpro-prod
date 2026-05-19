import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

const AUTH_CATEGORIES = [
  "public",
  "session-authenticated",
  "admin-only",
  "cron-token authenticated",
  "webhook-signature authenticated",
  "intentionally test/local-only",
] as const;

type AuthCategory = (typeof AUTH_CATEGORIES)[number];

const ROUTE_AUTH_CLASSIFICATIONS = {
  public: [
    "endpoints/admin/letter-template/delete_POST.ts",
    "endpoints/admin/letter-template/history_GET.ts",
    "endpoints/admin/letter-template/humanize_POST.ts",
    "endpoints/admin/letter-template/rollback_POST.ts",
    "endpoints/admin/letter-template/seed_POST.ts",
    "endpoints/admin/letter-template_POST.ts",
    "endpoints/admin/letter-templates_GET.ts",
    "endpoints/auth/establish_session_POST.ts",
    "endpoints/auth/login_with_password_POST.ts",
    "endpoints/auth/logout_POST.ts",
    "endpoints/auth/oauth_authorize_GET.ts",
    "endpoints/auth/oauth_callback_GET.ts",
    "endpoints/auth/register_with_password_POST.ts",
    "endpoints/auth/request_password_reset_POST.ts",
    "endpoints/auth/reset_password_POST.ts",
    "endpoints/auth/verify_email_POST.ts",
    "endpoints/escalation/auto-trigger_POST.ts",
    "endpoints/escalation/scan_POST.ts",
    "endpoints/escalation/trigger_POST.ts",
    "endpoints/ingest/anonymous-report_POST.ts",
    "endpoints/lead/reminder_POST.ts",
    "endpoints/pdf/platform-functions_GET.ts",
    "endpoints/planner/select_POST.ts",
  ],
  "session-authenticated": [
    "endpoints/ai-assist/consumer-finding-explanation_POST.ts",
    "endpoints/auth/request_verification_email_POST.ts",
    "endpoints/auth/session_GET.ts",
    "endpoints/bankruptcy/create_POST.ts",
    "endpoints/bankruptcy/delete_POST.ts",
    "endpoints/bankruptcy/list_GET.ts",
    "endpoints/bankruptcy/update_POST.ts",
    "endpoints/bureau/dispute-contacts_GET.ts",
    "endpoints/bureau/list_GET.ts",
    "endpoints/calendar/check-deadlines_POST.ts",
    "endpoints/cases/patch_POST.ts",
    "endpoints/cases/review-data_GET.ts",
    "endpoints/cases/review_GET.ts",
    "endpoints/consumer-signature/list_GET.ts",
    "endpoints/creditor-validation/create_POST.ts",
    "endpoints/creditor-validation/delete_POST.ts",
    "endpoints/creditor-validation/dismiss_POST.ts",
    "endpoints/creditor-validation/list_GET.ts",
    "endpoints/creditor-validation/update_POST.ts",
    "endpoints/dashboard/stats_GET.ts",
    "endpoints/deadline/complete_POST.ts",
    "endpoints/deadline/create_POST.ts",
    "endpoints/deadline/delete_POST.ts",
    "endpoints/deadline/overdue_GET.ts",
    "endpoints/deadline/upcoming_GET.ts",
    "endpoints/deadline/update_POST.ts",
    "endpoints/discrimination/create_POST.ts",
    "endpoints/discrimination/delete_POST.ts",
    "endpoints/discrimination/list_GET.ts",
    "endpoints/discrimination/update_POST.ts",
    "endpoints/enforcement-mechanism/list_GET.ts",
    "endpoints/evidence-attachment/list_GET.ts",
    "endpoints/evidence-attachment/package_POST.ts",
    "endpoints/evidence-attachment/upload_POST.ts",
    "endpoints/evidence/bureau-communication_POST.ts",
    "endpoints/evidence/create_POST.ts",
    "endpoints/evidence/delete_POST.ts",
    "endpoints/evidence/list_GET.ts",
    "endpoints/evidence/update_POST.ts",
    "endpoints/feature-flag/list_GET.ts",
    "endpoints/fraud-freeze/cancel_POST.ts",
    "endpoints/fraud-freeze/create_POST.ts",
    "endpoints/fraud-freeze/list_GET.ts",
    "endpoints/fraud-freeze/request-thaw_POST.ts",
    "endpoints/fraud-freeze/update_POST.ts",
    "endpoints/hidden-risk/list_GET.ts",
    "endpoints/ingest/process_POST.ts",
    "endpoints/ingest/report_POST.ts",
    "endpoints/legal-authority/search_GET.ts",
    "endpoints/licensed-agency/ai-verify_POST.ts",
    "endpoints/licensed-agency/check_GET.ts",
    "endpoints/metro2-validation-log/list_GET.ts",
    "endpoints/obligation-instance/list_GET.ts",
    "endpoints/obligation-instance/record-response_POST.ts",
    "endpoints/obligation/list_GET.ts",
    "endpoints/ocr/extract_POST.ts",
    "endpoints/outcomes/compare_POST.ts",
    "endpoints/outcomes/get_GET.ts",
    "endpoints/outcomes/list_GET.ts",
    "endpoints/packet/build_POST.ts",
    "endpoints/packet/compliance-audit_GET.ts",
    "endpoints/packet/compliance-calendar_GET.ts",
    "endpoints/packet/create_POST.ts",
    "endpoints/packet/delete_POST.ts",
    "endpoints/packet/delivery_POST.ts",
    "endpoints/packet/get_GET.ts",
    "endpoints/packet/impact_GET.ts",
    "endpoints/packet/list_GET.ts",
    "endpoints/packet/pdf_GET.ts",
    "endpoints/packet/recommend_GET.ts",
    "endpoints/packet/save_POST.ts",
    "endpoints/packet/send-first-class_POST.ts",
    "endpoints/packet/send-registered_POST.ts",
    "endpoints/packet/update-status_POST.ts",
    "endpoints/packet/validate-readiness_POST.ts",
    "endpoints/pdf/analytics-report_POST.ts",
    "endpoints/pdf/knowledge-base_GET.ts",
    "endpoints/pdf/report_POST.ts",
    "endpoints/postal/transactions_GET.ts",
    "endpoints/regulatory-notification/dismiss-all_POST.ts",
    "endpoints/regulatory-notification/mark-read_POST.ts",
    "endpoints/regulatory-update/list_GET.ts",
    "endpoints/report-artifact/create_POST.ts",
    "endpoints/report-artifact/delete_POST.ts",
    "endpoints/report-artifact/get_GET.ts",
    "endpoints/report-artifact/list_GET.ts",
    "endpoints/report-artifact/update_POST.ts",
    "endpoints/responses/capture_POST.ts",
    "endpoints/responses/get_GET.ts",
    "endpoints/responses/list_GET.ts",
    "endpoints/responses/metrics_GET.ts",
    "endpoints/review/approve_POST.ts",
    "endpoints/review/reject_POST.ts",
    "endpoints/statute/filter-options_GET.ts",
    "endpoints/statute/history_GET.ts",
    "endpoints/statute/list_GET.ts",
    "endpoints/stripe/create-payment-intent_POST.ts",
    "endpoints/subscription/cancel_POST.ts",
    "endpoints/subscription/confirm-payment_POST.ts",
    "endpoints/subscription/create-checkout_POST.ts",
    "endpoints/subscription/status_GET.ts",
    "endpoints/subscription/update-plan_POST.ts",
    "endpoints/success/analytics_GET.ts",
    "endpoints/support-ticket/agents_GET.ts",
    "endpoints/support-ticket/create_POST.ts",
    "endpoints/support-ticket/get_GET.ts",
    "endpoints/support-ticket/list_GET.ts",
    "endpoints/support-ticket/reply_POST.ts",
    "endpoints/support-ticket/update_POST.ts",
    "endpoints/support/ai-chat_POST.ts",
    "endpoints/tradeline/change-timeline_GET.ts",
    "endpoints/tradeline/create_POST.ts",
    "endpoints/tradeline/delete_POST.ts",
    "endpoints/tradeline/detect-changes_POST.ts",
    "endpoints/tradeline/drift-logs_GET.ts",
    "endpoints/tradeline/gap-fill_POST.ts",
    "endpoints/tradeline/get_GET.ts",
    "endpoints/tradeline/list_GET.ts",
    "endpoints/tradeline/rescan-compliance_POST.ts",
    "endpoints/tradeline/rotation-history_GET.ts",
    "endpoints/upload-results/get_GET.ts",
    "endpoints/user/accept-terms_POST.ts",
    "endpoints/user/data-summary_GET.ts",
    "endpoints/user/delete-account_POST.ts",
    "endpoints/user/delete-data_POST.ts",
    "endpoints/user/identification/delete_POST.ts",
    "endpoints/user/identification/file_GET.ts",
    "endpoints/user/identification_GET.ts",
    "endpoints/user/identification_POST.ts",
    "endpoints/user/profile_GET.ts",
    "endpoints/user/profile_POST.ts",
    "endpoints/version/current_GET.ts",
  ],
  "admin-only": [
    "endpoints/admin/ai-assist/findings_GET.ts",
    "endpoints/admin/ai-assist/runs_GET.ts",
    "endpoints/admin/audit-logs_GET.ts",
    "endpoints/admin/backfill-compliance_POST.ts",
    "endpoints/admin/cleanup-stale-auth_POST.ts",
    "endpoints/admin/compliance-config_GET.ts",
    "endpoints/admin/compliance-config_POST.ts",
    "endpoints/admin/create-support-agent_POST.ts",
    "endpoints/admin/delete-user_POST.ts",
    "endpoints/admin/diagnostic/semantic-audit_POST.ts",
    "endpoints/admin/mock-lifecycle/list_GET.ts",
    "endpoints/admin/mock-lifecycle/report_GET.ts",
    "endpoints/admin/mock-lifecycle/run_POST.ts",
    "endpoints/admin/mock-lifecycle/status_GET.ts",
    "endpoints/admin/postal-revenue_GET.ts",
    "endpoints/admin/purge_POST.ts",
    "endpoints/admin/reset-user_POST.ts",
    "endpoints/admin/retention/stats_GET.ts",
    "endpoints/admin/retention_POST.ts",
    "endpoints/admin/seed_POST.ts",
    "endpoints/admin/settings_GET.ts",
    "endpoints/admin/settings_POST.ts",
    "endpoints/admin/user-detail_GET.ts",
    "endpoints/admin/users_GET.ts",
    "endpoints/admin/violation-correction/create_POST.ts",
    "endpoints/admin/violation-correction/detail_GET.ts",
    "endpoints/admin/violation-correction/evidence_POST.ts",
    "endpoints/admin/violation-correction/export_POST.ts",
    "endpoints/admin/violation-correction/finalize_POST.ts",
    "endpoints/admin/violation-correction/regulation-reference_POST.ts",
    "endpoints/admin/violation-correction/runs_GET.ts",
    "endpoints/admin/violation-correction/update_POST.ts",
    "endpoints/audit/log_GET.ts",
    "endpoints/bureau-detection-config/list_GET.ts",
    "endpoints/bureau-detection-config/update_POST.ts",
    "endpoints/bureau-detection-config/upsert_POST.ts",
    "endpoints/bureau/create_POST.ts",
    "endpoints/bureau/delete_POST.ts",
    "endpoints/enforcement-mechanism/create_POST.ts",
    "endpoints/enforcement-mechanism/delete_POST.ts",
    "endpoints/enforcement-mechanism/update_POST.ts",
    "endpoints/feature-flag/create_POST.ts",
    "endpoints/feature-flag/delete_POST.ts",
    "endpoints/feature-flag/update_POST.ts",
    "endpoints/lead/send-reminders_POST.ts",
    "endpoints/licensed-agency/import_POST.ts",
    "endpoints/licensed-agency/list_GET.ts",
    "endpoints/migration/create_POST.ts",
    "endpoints/migration/list_GET.ts",
    "endpoints/migration/update_POST.ts",
    "endpoints/obligation/create_POST.ts",
    "endpoints/obligation/delete_POST.ts",
    "endpoints/obligation/update_POST.ts",
    "endpoints/outcomes/admin-review_POST.ts",
    "endpoints/parser-known-entity/create_POST.ts",
    "endpoints/parser-known-entity/list_GET.ts",
    "endpoints/parser-lab/run_POST.ts",
    "endpoints/parser-mapping/create_POST.ts",
    "endpoints/parser-mapping/delete_POST.ts",
    "endpoints/parser-mapping/history_GET.ts",
    "endpoints/parser-mapping/list_GET.ts",
    "endpoints/parser-mapping/rollback_POST.ts",
    "endpoints/parser-mapping/test_POST.ts",
    "endpoints/parser-mapping/update_POST.ts",
    "endpoints/parser-test-case/adjudicate_POST.ts",
    "endpoints/parser-test-case/create_POST.ts",
    "endpoints/parser-test-case/delete_POST.ts",
    "endpoints/parser-test-case/export_POST.ts",
    "endpoints/parser-test-case/import_POST.ts",
    "endpoints/parser-test-case/list_GET.ts",
    "endpoints/parser-test-case/promote-rule_POST.ts",
    "endpoints/parser-test-case/run-all_POST.ts",
    "endpoints/parser-test-case/run_POST.ts",
    "endpoints/parser-test-case/update_POST.ts",
    "endpoints/pdf/admin-knowledge-base_GET.ts",
    "endpoints/regulation-registry/advisory-bridge/report_GET.ts",
    "endpoints/regulation-registry/candidates_GET.ts",
    "endpoints/regulation-registry/create-candidate_POST.ts",
    "endpoints/regulation-registry/deactivate_POST.ts",
    "endpoints/regulation-registry/list_GET.ts",
    "endpoints/regulation-registry/mapping_GET.ts",
    "endpoints/regulation-registry/mapping_POST.ts",
    "endpoints/regulation-registry/rebuild-index_POST.ts",
    "endpoints/regulation-registry/reconciliation-candidates/create_POST.ts",
    "endpoints/regulation-registry/reconciliation-candidates/list_GET.ts",
    "endpoints/regulation-registry/reconciliation-candidates/update-status_POST.ts",
    "endpoints/regulation-registry/restore_POST.ts",
    "endpoints/regulation-registry/review_POST.ts",
    "endpoints/regulation-registry/runtime-bridge/create_POST.ts",
    "endpoints/regulation-registry/runtime-bridge/list_GET.ts",
    "endpoints/regulation-registry/runtime-bridge/update-status_POST.ts",
    "endpoints/regulation-registry/scan_POST.ts",
    "endpoints/regulation-registry/shadow-bridge/report_GET.ts",
    "endpoints/regulatory-notification/list_GET.ts",
    "endpoints/regulatory-update/auto-escalate_POST.ts",
    "endpoints/regulatory-update/create_POST.ts",
    "endpoints/regulatory-update/delete_POST.ts",
    "endpoints/regulatory-update/rollback_POST.ts",
    "endpoints/regulatory-update/scan_POST.ts",
    "endpoints/regulatory-update/update_POST.ts",
    "endpoints/responses/admin-review_POST.ts",
    "endpoints/responses/queue-remediation_POST.ts",
    "endpoints/responses/queue_GET.ts",
    "endpoints/scanning-rule/delete_POST.ts",
    "endpoints/scanning-rule/generate-all_POST.ts",
    "endpoints/scanning-rule/generate_POST.ts",
    "endpoints/scanning-rule/list_GET.ts",
    "endpoints/scanning-rule/update_POST.ts",
    "endpoints/statute/create_POST.ts",
    "endpoints/statute/delete_POST.ts",
    "endpoints/statute/update_POST.ts",
    "endpoints/tradeline/backfill-source-text_POST.ts",
    "endpoints/version/change-summary_GET.ts",
    "endpoints/version/create_POST.ts",
    "endpoints/version/delete_POST.ts",
    "endpoints/version/generate-notes_POST.ts",
    "endpoints/version/list_GET.ts",
    "endpoints/version/snapshot_POST.ts",
    "endpoints/version/update_POST.ts",
    "endpoints/version/validate-publish_POST.ts",
  ],
  "cron-token authenticated": [
    "endpoints/clock/scan_POST.ts",
    "endpoints/regulation-registry/scheduled-scan_POST.ts",
    "endpoints/retention/auto-purge_POST.ts",
  ],
  "webhook-signature authenticated": [
    "endpoints/webhook/postgrid_POST.ts",
    "endpoints/webhook/stripe_POST.ts",
    "endpoints/webhook/tracking_POST.ts",
  ],
  "intentionally test/local-only": [],
} satisfies Record<AuthCategory, readonly string[]>;

function toPosix(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function walkFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    return statSync(fullPath).isDirectory() ? walkFiles(fullPath) : [fullPath];
  });
}

function endpointHandlers(): string[] {
  return walkFiles(path.join(projectRoot, "endpoints"))
    .map((filePath) => toPosix(path.relative(projectRoot, filePath)))
    .filter((filePath) => /_(GET|POST)\.ts$/.test(filePath))
    .filter((filePath) => !filePath.endsWith(".schema.ts"))
    .sort();
}

function endpointPathToHandlerFile(method: string, apiPath: string): string {
  const endpointPath = apiPath.replace(/^_api\//, "");
  const segments = endpointPath.split("/");
  const handlerName = `${segments.pop()}_${method.toUpperCase()}.ts`;
  return toPosix(path.join("endpoints", ...segments, handlerName));
}

function serverRouteHandlers(): string[] {
  const serverSource = readFileSync(path.join(projectRoot, "server.ts"), "utf8");
  return [...serverSource.matchAll(/app\.(get|post)\('([^']+)'/g)]
    .filter(([, , apiPath]) => apiPath.startsWith("_api/"))
    .map(([, method, apiPath]) => endpointPathToHandlerFile(method, apiPath))
    .sort();
}

function endpointSource(handlerFile: string): string {
  return readFileSync(path.join(projectRoot, handlerFile), "utf8");
}

function classificationEntries(): Array<{ category: AuthCategory; handlerFile: string }> {
  return AUTH_CATEGORIES.flatMap((category) =>
    ROUTE_AUTH_CLASSIFICATIONS[category].map((handlerFile) => ({ category, handlerFile }))
  );
}

function duplicateClassifications(): string[] {
  const seen = new Map<string, AuthCategory>();
  const duplicates: string[] = [];

  for (const { category, handlerFile } of classificationEntries()) {
    const previousCategory = seen.get(handlerFile);
    if (previousCategory) {
      duplicates.push(`${handlerFile} (${previousCategory}, ${category})`);
    }
    seen.set(handlerFile, category);
  }

  return duplicates;
}

function classificationMap(): Map<string, AuthCategory> {
  return new Map(classificationEntries().map(({ category, handlerFile }) => [handlerFile, category]));
}

function expectCategory(handlerFile: string, category: AuthCategory): void {
  expect(classificationMap().get(handlerFile)).toBe(category);
}

function hasSessionGuard(source: string): boolean {
  return /getServerUserSession|getServerSessionOrThrow|resolveUserSession/.test(source);
}

function hasAdminGuard(source: string): boolean {
  return /\b[a-zA-Z0-9_]+\.role\s*!==\s*["']admin["']|!\s*isAdmin\([a-zA-Z0-9_]+\)|Admin (?:privileges|access|role|required)|Admin only endpoint|Forbidden: Admin access required/i.test(
    source
  );
}

function hasCronGuard(source: string): boolean {
  return /deriveCronSecret|CRON_SECRET/.test(source) && /Authorization|Bearer|token/i.test(source);
}

function hasWebhookGuard(source: string): boolean {
  return /stripe\.webhooks\.constructEvent|stripe-signature|x-postgrid-signature|createHmac|timingSafeEqual|POSTGRID_WEBHOOK_SECRET/.test(
    source
  );
}

describe("route auth classification contract", () => {
  it("classifies every endpoint handler exactly once", () => {
    const classifiedHandlers = classificationEntries()
      .map(({ handlerFile }) => handlerFile)
      .sort();

    expect(duplicateClassifications()).toEqual([]);
    expect(classifiedHandlers).toEqual(endpointHandlers());
    expect(classifiedHandlers).toEqual(serverRouteHandlers());
    expect(classifiedHandlers).toHaveLength(281);
  });

  it("keeps representative public endpoints explicitly public", () => {
    expectCategory("endpoints/auth/login_with_password_POST.ts", "public");
    expectCategory("endpoints/auth/oauth_authorize_GET.ts", "public");
    expectCategory("endpoints/auth/register_with_password_POST.ts", "public");
    expectCategory("endpoints/ingest/anonymous-report_POST.ts", "public");
    expectCategory("endpoints/pdf/platform-functions_GET.ts", "public");

    for (const handlerFile of ROUTE_AUTH_CLASSIFICATIONS.public.filter((file) => file.startsWith("endpoints/admin/"))) {
      expect(endpointSource(handlerFile)).toMatch(/RESET_MESSAGE|status:\s*410/);
    }
  });

  it("requires representative user endpoints to use session auth", () => {
    const sessionEndpoints = [
      "endpoints/auth/session_GET.ts",
      "endpoints/evidence/list_GET.ts",
      "endpoints/packet/get_GET.ts",
      "endpoints/report-artifact/list_GET.ts",
    ];

    for (const handlerFile of sessionEndpoints) {
      expectCategory(handlerFile, "session-authenticated");
      expect(hasSessionGuard(endpointSource(handlerFile))).toBe(true);
    }
  });

  it("requires representative admin endpoints to use admin auth", () => {
    const adminEndpoints = [
      "endpoints/admin/users_GET.ts",
      "endpoints/audit/log_GET.ts",
      "endpoints/parser-mapping/list_GET.ts",
      "endpoints/regulation-registry/runtime-bridge/list_GET.ts",
    ];

    for (const handlerFile of adminEndpoints) {
      const source = endpointSource(handlerFile);
      expectCategory(handlerFile, "admin-only");
      expect(hasSessionGuard(source)).toBe(true);
      expect(hasAdminGuard(source)).toBe(true);
    }
  });

  it("requires cron endpoints to use cron-token guards", () => {
    const cronEndpoints = [
      "endpoints/clock/scan_POST.ts",
      "endpoints/regulation-registry/scheduled-scan_POST.ts",
      "endpoints/retention/auto-purge_POST.ts",
    ];

    for (const handlerFile of cronEndpoints) {
      expectCategory(handlerFile, "cron-token authenticated");
      expect(hasCronGuard(endpointSource(handlerFile))).toBe(true);
    }
  });

  it("requires webhook endpoints to use webhook signature or shared-secret guards", () => {
    const webhookEndpoints = [
      "endpoints/webhook/postgrid_POST.ts",
      "endpoints/webhook/stripe_POST.ts",
      "endpoints/webhook/tracking_POST.ts",
    ];

    for (const handlerFile of webhookEndpoints) {
      expectCategory(handlerFile, "webhook-signature authenticated");
      expect(hasWebhookGuard(endpointSource(handlerFile))).toBe(true);
    }
  });

  it("keeps all protected endpoint classifications tied to guard patterns", () => {
    for (const handlerFile of ROUTE_AUTH_CLASSIFICATIONS["session-authenticated"]) {
      expect(hasSessionGuard(endpointSource(handlerFile))).toBe(true);
    }

    for (const handlerFile of ROUTE_AUTH_CLASSIFICATIONS["admin-only"]) {
      const source = endpointSource(handlerFile);
      expect(hasSessionGuard(source)).toBe(true);
      expect(hasAdminGuard(source)).toBe(true);
    }

    for (const handlerFile of ROUTE_AUTH_CLASSIFICATIONS["cron-token authenticated"]) {
      expect(hasCronGuard(endpointSource(handlerFile))).toBe(true);
    }

    for (const handlerFile of ROUTE_AUTH_CLASSIFICATIONS["webhook-signature authenticated"]) {
      expect(hasWebhookGuard(endpointSource(handlerFile))).toBe(true);
    }
  });
});
