import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("public static dev assets", () => {
  it("keeps internal dev artifacts outside the publicly served static tree", () => {
    const repoRoot = process.cwd();
    const staticDevArchive = join(repoRoot, "static", "__dev");
    const staticSystemPrompt = join(staticDevArchive, "system-prompt.md");
    const internalSystemPrompt = join(repoRoot, "docs", "internal", "system-prompt.md");
    const internalDevArchive = join(repoRoot, "docs", "internal", "dev");
    const serverSource = readFileSync(join(repoRoot, "server.ts"), "utf8");

    expect(serverSource).toContain("serveStatic({ root: \"./static\" })");
    expect(existsSync(staticDevArchive)).toBe(false);
    expect(existsSync(staticSystemPrompt)).toBe(false);
    expect(existsSync(internalSystemPrompt)).toBe(true);
    expect(existsSync(join(internalDevArchive, "notes"))).toBe(true);
    expect(existsSync(join(internalDevArchive, "plans"))).toBe(true);
    expect(existsSync(join(internalDevArchive, "scheduled-jobs.json"))).toBe(true);
  });
});
