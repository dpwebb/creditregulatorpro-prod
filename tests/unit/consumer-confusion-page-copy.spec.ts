import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

const consumerFacingPages = [
  "pages/_index.tsx",
  "pages/login.tsx",
  "pages/register.tsx",
  "pages/reset-password.tsx",
  "pages/verify-email.tsx",
  "pages/upload.tsx",
  "pages/try-upload.tsx",
  "pages/upload-review.$artifactId.tsx",
  "pages/upload-results.$artifactId.tsx",
  "pages/my-info.tsx",
  "pages/my-accounts.tsx",
  "pages/tradelines.$id.tsx",
  "pages/tradelines-tab.tsx",
  "pages/packets.tsx",
  "pages/evidence.tsx",
  "pages/progress.tsx",
  "pages/contact.tsx",
  "pages/support-tickets.tsx",
  "pages/support-tickets.$ticketId.tsx",
  "pages/profile-settings.tsx",
  "pages/user-manual.tsx",
];

const nextStepCues = [
  "upload",
  "choose",
  "continue",
  "start",
  "sign in",
  "register",
  "reset",
  "verify",
  "review",
  "open",
  "view",
  "see",
  "create",
  "add",
  "save",
  "submit",
  "send",
  "download",
  "contact",
  "update",
  "back",
  "get",
  "track",
];

const unsafeLegalConclusionPatterns = [
  /\byou will win\b/i,
  /\bdefinitely illegal\b/i,
  /\bproves?\s+(?:a\s+)?violation\b/i,
  /\bconfirmed legal violation basis\b/i,
];

const wrapperPageSources: Record<string, string[]> = {
  "pages/progress.tsx": ["pages/analytics-dashboard.tsx"],
};

function source(path: string): string {
  const primary = readFileSync(join(root, path), "utf8");
  const wrapped = wrapperPageSources[path] ?? [];
  return [primary, ...wrapped.map((wrappedPath) => readFileSync(join(root, wrappedPath), "utf8"))].join("\n");
}

function hasNextStepCue(value: string): boolean {
  const normalized = value.toLowerCase();
  return nextStepCues.some((cue) => normalized.includes(cue));
}

describe("consumer confusion page copy guardrail", () => {
  it.each(consumerFacingPages)(
    "%s gives a non-technical user a visible next step",
    (pagePath) => {
      expect(hasNextStepCue(source(pagePath))).toBe(true);
    },
  );

  it.each(consumerFacingPages)(
    "%s does not present legal references as guaranteed legal conclusions",
    (pagePath) => {
      const pageSource = source(pagePath);

      for (const pattern of unsafeLegalConclusionPatterns) {
        expect(pageSource, `${pagePath} matched ${pattern}`).not.toMatch(pattern);
      }
    },
  );
});
