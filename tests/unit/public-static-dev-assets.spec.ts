import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const textAssetExtensions = new Set([".json", ".markdown", ".md", ".txt"]);
const internalArtifactPattern =
  /(confidential|internal use|system-prompt|__dev|scheduled-jobs|admin[- ]new[- ]hire|new[- ]hire|instruction[- ]manual)/i;

function listFiles(root: string): string[] {
  if (!existsSync(root)) return [];

  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(root, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}

function repoRelative(repoRoot: string, filePath: string): string {
  return relative(repoRoot, filePath).split(sep).join("/");
}

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

  it("does not publish internal text documents from public static roots", () => {
    const repoRoot = process.cwd();
    const publicTextAssets = [join(repoRoot, "static"), join(repoRoot, "public")]
      .flatMap(listFiles)
      .filter((filePath) => textAssetExtensions.has(extname(filePath).toLowerCase()))
      .map((filePath) => repoRelative(repoRoot, filePath))
      .sort();

    expect(publicTextAssets).toEqual(["static/manifest.json"]);
  });

  it("keeps internal and confidential PDFs out of generated output artifacts", () => {
    const repoRoot = process.cwd();
    const riskyPdfArtifacts = listFiles(join(repoRoot, "output", "pdf"))
      .filter((filePath) => extname(filePath).toLowerCase() === ".pdf")
      .filter((filePath) => {
        const repoPath = repoRelative(repoRoot, filePath);
        const metadataText = readFileSync(filePath).toString("latin1");
        return internalArtifactPattern.test(repoPath) || internalArtifactPattern.test(metadataText);
      })
      .map((filePath) => repoRelative(repoRoot, filePath))
      .sort();

    expect(riskyPdfArtifacts).toEqual([]);
  });
});
