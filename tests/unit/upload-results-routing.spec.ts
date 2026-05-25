import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("upload results routing", () => {
  it("routes all-problems actions to the persisted Problems surface instead of the legacy upload-review scanner", () => {
    const text = source("components/UploadScanSummary.tsx");

    expect(text).toContain('PERSISTED_PROBLEMS_ROUTE = "/my-accounts?tab=problems"');
    expect(text).not.toContain("`/upload-review/${artifactId}`");
  });
});
