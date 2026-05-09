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
    expect(queryHelper).toContain("postConsumerFindingExplanationAssist");
  });

  it("exposes recent AI assist runs through an admin-only endpoint", () => {
    const endpoint = source("endpoints/admin/ai-assist/runs_GET.ts");
    const server = source("server.ts");

    expect(endpoint).toContain("getServerUserSession");
    expect(endpoint).toContain('user.role !== "admin"');
    expect(endpoint).toContain("ensureAiAssistRunSchema");
    expect(endpoint).toContain("input_hash");
    expect(endpoint).not.toContain("userPrompt");
    expect(server).toContain("_api/admin/ai-assist/runs");
  });

  it("keeps the AI feature flag key in a client-safe constant module", () => {
    const constants = source("helpers/aiAssistConstants.ts");
    const schema = source("endpoints/ai-assist/consumer-finding-explanation_POST.schema.ts");

    expect(constants).toContain("ai.consumer_explanation_assist");
    expect(schema).toContain("import type");
  });
});
