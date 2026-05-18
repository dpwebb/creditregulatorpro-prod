import { describe, expect, it } from "vitest";
import { ADMIN_SIDEBAR_ROUTE_GROUPS, ADMIN_SIDEBAR_ROUTES } from "../../helpers/adminSidebarRoutes";

describe("admin sidebar route registry", () => {
  it("covers every admin sidebar route once", () => {
    const paths = ADMIN_SIDEBAR_ROUTES.map((route) => route.path);
    expect(paths).toHaveLength(new Set(paths).size);
    expect(paths).toEqual([
      "/",
      "/admin-user-management",
      "/admin-risk-triage",
      "/admin-compliance-config",
      "/admin-activity-logs",
      "/admin-outcome-reviews",
      "/admin-error-logs",
      "/admin-security",
      "/support-tickets",
      "/admin-knowledge-base",
      "/bureaus",
      "/statutes",
      "/metro2-compliance",
      "/creditor-obligations",
      "/bureau-obligations",
      "/collector-obligations",
      "/enforcement-mechanisms",
      "/regulatory-updates",
      "/admin-mock-lifecycle",
      "/admin-parser-testing",
      "/admin-parser-mappings",
      "/admin-ai-assist",
      "/admin-version-management",
    ]);
  });

  it("keeps grouped route metadata available for navigation and E2E tests", () => {
    expect(ADMIN_SIDEBAR_ROUTE_GROUPS.map((group) => group.group)).toEqual(["Platform", "Legal & Rules", "Tools"]);
    expect(ADMIN_SIDEBAR_ROUTES.every((route) => route.label && route.path.startsWith("/"))).toBe(true);
  });
});
