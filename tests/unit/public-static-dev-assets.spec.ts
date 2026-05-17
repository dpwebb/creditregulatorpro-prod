import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("public static dev assets", () => {
  it("keeps the project system prompt outside the publicly served static tree", () => {
    const repoRoot = process.cwd();
    const staticSystemPrompt = join(repoRoot, "static", "__dev", "system-prompt.md");
    const internalSystemPrompt = join(repoRoot, "docs", "internal", "system-prompt.md");
    const serverSource = readFileSync(join(repoRoot, "server.ts"), "utf8");

    expect(serverSource).toContain("serveStatic({ root: \"./static\" })");
    expect(existsSync(staticSystemPrompt)).toBe(false);
    expect(existsSync(internalSystemPrompt)).toBe(true);
  });
});
