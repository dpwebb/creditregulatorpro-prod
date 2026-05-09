import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("compliance finding ID display", () => {
  it("shows the creditor obligation test id on violation cards", () => {
    const component = source("components/ComplianceViolationCard.tsx");
    const styles = source("components/ComplianceViolationCard.module.css");

    expect(component).toContain("Finding #{violation.id}");
    expect(component).toContain("styles.findingId");
    expect(styles).toContain(".findingId");
    expect(styles).toContain(".cardMeta");
  });
});
