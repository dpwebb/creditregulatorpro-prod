import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("admin AI assist pane", () => {
  it("mounts as a Version Management tab", () => {
    const page = source("pages/admin-version-management.tsx");

    expect(page).toContain("AdminAiAssistTab");
    expect(page).toContain('value="ai-assist"');
    expect(page).toContain("AI Assist");
  });

  it("uses the guarded consumer explanation endpoint for previews", () => {
    const component = source("components/AdminAiAssistTab.tsx");
    const queryHelper = source("helpers/adminAiAssistQueries.tsx");

    expect(component).toContain("AI_CONSUMER_EXPLANATION_FEATURE_KEY");
    expect(component).toContain("usePreviewConsumerFindingExplanationAssist");
    expect(component).toContain("Deterministic Fallback");
    expect(component).toContain("Finding Lookup");
    expect(component).toContain("handleUseFinding");
    expect(queryHelper).toContain("postConsumerFindingExplanationAssist");
  });

  it("exposes recent AI assist runs and finding lookup through admin-only endpoints", () => {
    const runsEndpoint = source("endpoints/admin/ai-assist/runs_GET.ts");
    const findingsEndpoint = source("endpoints/admin/ai-assist/findings_GET.ts");
    const queryHelper = source("helpers/adminAiAssistQueries.tsx");
    const server = source("server.ts");

    expect(runsEndpoint).toContain("getServerUserSession");
    expect(runsEndpoint).toContain('user.role !== "admin"');
    expect(runsEndpoint).toContain("ensureAiAssistRunSchema");
    expect(runsEndpoint).toContain("input_hash");
    expect(runsEndpoint).not.toContain("userPrompt");
    expect(findingsEndpoint).toContain("getServerUserSession");
    expect(findingsEndpoint).toContain('user.role !== "admin"');
    expect(findingsEndpoint).toContain("maskAccountNumber");
    expect(findingsEndpoint).not.toContain("source_text");
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
