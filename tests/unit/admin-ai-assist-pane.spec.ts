import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("admin AI assist pane", () => {
  it("mounts as its own admin action area", () => {
    const aiAssistPage = source("pages/admin-ai-assist.tsx");
    const versionPage = source("pages/admin-version-management.tsx");
    const app = source("App.tsx");
    const layout = source("components/AppLayout.tsx");
    const sidebarRoutes = source("helpers/adminSidebarRoutes.ts");

    expect(aiAssistPage).toContain("AdminAiAssistTab");
    expect(app).toContain('["./pages/admin-ai-assist.tsx","/admin-ai-assist"]');
    expect(app).toContain('"./pages/admin-ai-assist.tsx": PageLayout_57');
    expect(layout).toContain("ADMIN_SIDEBAR_ROUTE_GROUPS");
    expect(sidebarRoutes).toContain('path: "/admin-ai-assist"');
    expect(versionPage).not.toContain("AdminAiAssistTab");
    expect(versionPage).not.toContain('value="ai-assist"');
  });

  it("uses the guarded consumer explanation endpoint for previews", () => {
    const component = source("components/AdminAiAssistTab.tsx");
    const queryHelper = source("helpers/adminAiAssistQueries.tsx");

    expect(component).toContain("AI_CONSUMER_EXPLANATION_FEATURE_KEY");
    expect(component).toContain("usePreviewConsumerFindingExplanationAssist");
    expect(component).toContain("Deterministic Fallback");
    expect(component).toContain("Finding Lookup");
    expect(component).toContain("Finding lookup failed");
    expect(component).toContain("runsQuery.refetch");
    expect(component).toContain("Recent AI assist runs failed to load");
    expect(component).toContain("handleUseFinding");
    expect(queryHelper).toContain("postConsumerFindingExplanationAssist");
  });

  it("exposes recent AI assist runs and finding lookup through admin-only endpoints", () => {
    const runsEndpoint = source("endpoints/admin/ai-assist/runs_GET.ts");
    const findingsEndpoint = source("endpoints/admin/ai-assist/findings_GET.ts");
    const runStore = source("helpers/aiAssistRunStore.ts");
    const queryHelper = source("helpers/adminAiAssistQueries.tsx");
    const server = source("server.ts");

    expect(runsEndpoint).toContain("requireAdminUser");
    expect(runsEndpoint).not.toContain("getServerUserSession");
    expect(runsEndpoint).not.toContain('user.role !== "admin"');
    expect(runsEndpoint).toContain("ensureAiAssistRunSchema");
    expect(runsEndpoint).toContain("input_hash");
    expect(runsEndpoint).not.toContain("userPrompt");
    expect(findingsEndpoint).toContain("requireAdminUser");
    expect(findingsEndpoint).not.toContain("getServerUserSession");
    expect(findingsEndpoint).not.toContain('user.role !== "admin"');
    expect(findingsEndpoint).toContain("maskAccountNumber");
    expect(findingsEndpoint).toContain("report_artifact ra");
    expect(findingsEndpoint).toContain("packet_owner");
    expect(findingsEndpoint).toContain("user_account ua");
    expect(findingsEndpoint).toContain("ua.email ilike");
    expect(findingsEndpoint).not.toContain("source_text");
    expect(runStore).toContain("to_regclass('public.ai_assist_run')");
    expect(runStore).toContain("ensurePromise = null");
    expect(queryHelper).toContain("useAdminAiAssistFindings");
    expect(server).toContain("_api/admin/ai-assist/runs");
    expect(server).toContain("_api/admin/ai-assist/findings");
  });

  it("keeps the AI feature flag key in a client-safe constant module", () => {
    const constants = source("helpers/aiAssistConstants.ts");
    const schema = source("endpoints/ai-assist/consumer-finding-explanation_POST.schema.ts");

    expect(constants).toContain("ai.consumer_explanation_assist");
    expect(schema).toContain("import type");
  });
});
