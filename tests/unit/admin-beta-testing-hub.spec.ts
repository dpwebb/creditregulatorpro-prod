import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appendFile: vi.fn(),
  getServerUserSession: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  appendFile: mocks.appendFile,
  default: {
    appendFile: mocks.appendFile,
    mkdir: mocks.mkdir,
  },
  mkdir: mocks.mkdir,
}));

vi.mock("../../helpers/getServerUserSession", () => ({
  getServerUserSession: mocks.getServerUserSession,
}));

import { handle as logBetaReport } from "../../endpoints/admin/beta-testing-hub/log_POST";
import { handle as generateBetaPrompt } from "../../endpoints/admin/beta-testing-hub/prompt_POST";

const root = process.cwd();

function source(filePath: string): string {
  return readFileSync(join(root, filePath), "utf8");
}

function postRequest(path: string, body: unknown, host = "staging.creditregulatorpro.com") {
  return new Request(`https://${host}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const betaIssue = {
  title: "Packet preview button stalls",
  severity: "P2" as const,
  area: "Packets",
  stagingUrl: "https://staging.creditregulatorpro.com/packets",
  observed: "Admin clicks preview and the button stays disabled.",
  expected: "Preview either opens or shows a recoverable error.",
  reproductionSteps: "1. Log in as admin\n2. Open a ready packet\n3. Click preview",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  mocks.getServerUserSession.mockResolvedValue({
    user: { id: 42, role: "admin" },
  });
});

describe("admin beta testing hub", () => {
  it("mounts as an admin-only page and sidebar route", () => {
    expect(source("App.tsx")).toContain('["./pages/admin-beta-testing-hub.tsx","/admin-beta-testing-hub"]');
    expect(source("App.tsx")).toContain('"./pages/admin-beta-testing-hub.tsx": PageLayout_61');
    expect(source("pages/admin-beta-testing-hub.pageLayout.tsx")).toContain("AdminRoute");
    expect(source("helpers/adminSidebarRoutes.ts")).toContain('path: "/admin-beta-testing-hub"');
  });

  it("generates a deterministic staging-only Codex prompt", async () => {
    const response = await generateBetaPrompt(
      postRequest("/_api/admin/beta-testing-hub/prompt", betaIssue),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      promptSource: "deterministic-template",
      stagingOnly: true,
      readinessCommand: "pnpm run beta-live:certify",
      readinessAuthority: "SAFE_FOR_BETA_LIVE=true/false",
    });
    expect(body.issueId).toMatch(/^beta-\d{14}-[a-f0-9]{8}$/);
    expect(body.prompt).toContain("FIX means this prompt handoff only");
    expect(body.prompt).toContain("Codex performs implementation separately");
    expect(body.prompt).toContain("pnpm run beta-live:certify");
    expect(body.prompt).not.toContain("OPENAI_API_KEY");
  });

  it("fails closed away from the live staging host", async () => {
    const response = await generateBetaPrompt(
      postRequest("/_api/admin/beta-testing-hub/prompt", betaIssue, "localhost"),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Beta Testing Hub is available on live staging only.",
    });
  });

  it("enforces admin-only access before generating prompts", async () => {
    mocks.getServerUserSession.mockResolvedValueOnce({
      user: { id: 43, role: "support" },
    });

    const response = await generateBetaPrompt(
      postRequest("/_api/admin/beta-testing-hub/prompt", betaIssue),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Admin access required" });
  });

  it("logs pasted Codex reports to server JSONL with secret redaction", async () => {
    const response = await logBetaReport(
      postRequest("/_api/admin/beta-testing-hub/log", {
        issueId: "beta-20260523120000-abcdef12",
        title: betaIssue.title,
        codexReport:
          "Changed files: pages/admin-beta-testing-hub.tsx\nOPENAI_API_KEY=sk-proj-secretvalue1234567890\nBearer secret-token-value",
        generatedPrompt: "prompt body",
      }),
    );
    const body = await response.json();
    const appendedLine = String(mocks.appendFile.mock.calls[0]?.[1] ?? "");
    const record = JSON.parse(appendedLine);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      stored: true,
      logTarget: "server-jsonl",
    });
    expect(record).toMatchObject({
      type: "beta_testing_hub_codex_report",
      issueId: "beta-20260523120000-abcdef12",
      title: betaIssue.title,
      adminUserId: 42,
      readinessCommand: "pnpm run beta-live:certify",
      readinessAuthority: "SAFE_FOR_BETA_LIVE=true/false",
    });
    expect(record.codexReport).toContain("OPENAI_API_KEY=[REDACTED]");
    expect(record.codexReport).toContain("Bearer [REDACTED_TOKEN]");
    expect(record.codexReport).not.toContain("sk-proj-secretvalue");
  });
});
