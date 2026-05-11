import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("admin letter template AI human draft", () => {
  it("exposes an admin-only human draft endpoint and editor action", () => {
    const page = source("pages/admin-letter-templates.tsx");
    const hook = source("helpers/useLetterTemplates.tsx");
    const endpoint = source("endpoints/admin/letter-template/humanize_POST.ts");
    const schema = source("endpoints/admin/letter-template/humanize_POST.schema.ts");
    const server = source("server.ts");

    expect(page).toContain("useHumanizeLetterTemplate");
    expect(page).toContain("AI Human Draft");
    expect(hook).toContain("postHumanizeLetterTemplate");
    expect(endpoint).toContain("getServerUserSession");
    expect(endpoint).toContain('user.role !== "admin"');
    expect(schema).toContain("/_api/admin/letter-template/humanize");
    expect(server).toContain("_api/admin/letter-template/humanize");
  });
});
