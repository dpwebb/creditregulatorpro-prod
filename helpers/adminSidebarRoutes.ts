export type AdminSidebarRouteGroupName = "Platform" | "Legal & Rules" | "Tools";

export type AdminSidebarRoute = {
  path: string;
  label: string;
};

export type AdminSidebarRouteGroup = {
  group: AdminSidebarRouteGroupName;
  items: readonly AdminSidebarRoute[];
};

export const ADMIN_SIDEBAR_ROUTE_GROUPS = [
  {
    group: "Platform",
    items: [
      { path: "/", label: "Home" },
      { path: "/admin-user-management", label: "User Management" },
      { path: "/admin-risk-triage", label: "Risk Triage" },
      { path: "/admin-compliance-config", label: "Rule Check Settings" },
      { path: "/admin-activity-logs", label: "Activity Logs" },
      { path: "/admin-error-logs", label: "Error Logs" },
      { path: "/admin-security", label: "Security & Compliance" },
      { path: "/support-tickets", label: "Support Tickets" },
      { path: "/admin-knowledge-base", label: "Admin Guide" },
    ],
  },
  {
    group: "Legal & Rules",
    items: [
      { path: "/bureaus", label: "Credit Reporting Companies" },
      { path: "/statutes", label: "Laws" },
      { path: "/metro2-compliance", label: "Reporting Format Guide" },
      { path: "/creditor-obligations", label: "Rules Creditors Must Follow" },
      { path: "/bureau-obligations", label: "Rules Credit Reporting Companies Must Follow" },
      { path: "/collector-obligations", label: "Rules Collectors Must Follow" },
      { path: "/enforcement-mechanisms", label: "Enforcement" },
      { path: "/regulatory-updates", label: "Regulatory Updates" },
    ],
  },
  {
    group: "Tools",
    items: [
      { path: "/admin-mock-lifecycle", label: "Lifecycle Testing" },
      { path: "/admin-parser-testing", label: "Parser Testing" },
      { path: "/admin-parser-mappings", label: "Parser Mappings" },
      { path: "/admin-ai-assist", label: "AI Assist" },
      { path: "/admin-version-management", label: "Version Management" },
    ],
  },
] as const satisfies readonly AdminSidebarRouteGroup[];

export type AdminSidebarPath = string;

export const ADMIN_SIDEBAR_ROUTES: readonly AdminSidebarRoute[] = ADMIN_SIDEBAR_ROUTE_GROUPS.flatMap((group) => [
  ...group.items,
]);
