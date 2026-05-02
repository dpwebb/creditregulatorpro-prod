import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { GlobalContextProviders } from "./components/_globalContextProviders";
import Page_0 from "./pages/login.tsx";
import PageLayout_0 from "./pages/login.pageLayout.tsx";
import Page_1 from "./pages/_index.tsx";
import PageLayout_1 from "./pages/_index.pageLayout.tsx";
import Page_2 from "./pages/upload.tsx";
import PageLayout_2 from "./pages/upload.pageLayout.tsx";
import Page_3 from "./pages/bureaus.tsx";
import PageLayout_3 from "./pages/bureaus.pageLayout.tsx";
import Page_4 from "./pages/contact.tsx";
import PageLayout_4 from "./pages/contact.pageLayout.tsx";
import Page_5 from "./pages/my-info.tsx";
import PageLayout_5 from "./pages/my-info.pageLayout.tsx";
import Page_6 from "./pages/packets.tsx";
import PageLayout_6 from "./pages/packets.pageLayout.tsx";
import Page_7 from "./pages/calendar.tsx";
import PageLayout_7 from "./pages/calendar.pageLayout.tsx";
import Page_8 from "./pages/evidence.tsx";
import PageLayout_8 from "./pages/evidence.pageLayout.tsx";
import Page_9 from "./pages/progress.tsx";
import PageLayout_9 from "./pages/progress.pageLayout.tsx";
import Page_10 from "./pages/register.tsx";
import PageLayout_10 from "./pages/register.pageLayout.tsx";
import Page_11 from "./pages/statutes.tsx";
import PageLayout_11 from "./pages/statutes.pageLayout.tsx";
import Page_12 from "./pages/try-upload.tsx";
import PageLayout_12 from "./pages/try-upload.pageLayout.tsx";
import Page_13 from "./pages/my-accounts.tsx";
import PageLayout_13 from "./pages/my-accounts.pageLayout.tsx";
import Page_14 from "./pages/user-manual.tsx";
import PageLayout_14 from "./pages/user-manual.pageLayout.tsx";
import Page_15 from "./pages/cases.review.tsx";
import PageLayout_15 from "./pages/cases.review.pageLayout.tsx";
import Page_16 from "./pages/verify-email.tsx";
import PageLayout_16 from "./pages/verify-email.pageLayout.tsx";
import Page_17 from "./pages/admin-security.tsx";
import PageLayout_17 from "./pages/admin-security.pageLayout.tsx";
import Page_18 from "./pages/privacy-policy.tsx";
import PageLayout_18 from "./pages/privacy-policy.pageLayout.tsx";
import Page_19 from "./pages/reset-password.tsx";
import PageLayout_19 from "./pages/reset-password.pageLayout.tsx";
import Page_20 from "./pages/tradelines-tab.tsx";
import PageLayout_20 from "./pages/tradelines-tab.pageLayout.tsx";
import Page_21 from "./pages/tradelines.$id.tsx";
import PageLayout_21 from "./pages/tradelines.$id.pageLayout.tsx";
import Page_22 from "./pages/evidence-events.tsx";
import PageLayout_22 from "./pages/evidence-events.pageLayout.tsx";
import Page_23 from "./pages/support-tickets.tsx";
import PageLayout_23 from "./pages/support-tickets.pageLayout.tsx";
import Page_24 from "./pages/admin-error-logs.tsx";
import PageLayout_24 from "./pages/admin-error-logs.pageLayout.tsx";
import Page_25 from "./pages/change-detection.tsx";
import PageLayout_25 from "./pages/change-detection.pageLayout.tsx";
import Page_26 from "./pages/compliance-audit.tsx";
import PageLayout_26 from "./pages/compliance-audit.pageLayout.tsx";
import Page_27 from "./pages/profile-settings.tsx";
import PageLayout_27 from "./pages/profile-settings.pageLayout.tsx";
import Page_28 from "./pages/report-artifacts.tsx";
import PageLayout_28 from "./pages/report-artifacts.pageLayout.tsx";
import Page_29 from "./pages/terms-of-service.tsx";
import PageLayout_29 from "./pages/terms-of-service.pageLayout.tsx";
import Page_30 from "./pages/deadline-calendar.tsx";
import PageLayout_30 from "./pages/deadline-calendar.pageLayout.tsx";
import Page_31 from "./pages/metro2-compliance.tsx";
import PageLayout_31 from "./pages/metro2-compliance.pageLayout.tsx";
import Page_32 from "./pages/bankruptcy-tracker.tsx";
import PageLayout_32 from "./pages/bankruptcy-tracker.pageLayout.tsx";
import Page_33 from "./pages/bureau-obligations.tsx";
import PageLayout_33 from "./pages/bureau-obligations.pageLayout.tsx";
import Page_34 from "./pages/regulatory-updates.tsx";
import PageLayout_34 from "./pages/regulatory-updates.pageLayout.tsx";
import Page_35 from "./pages/admin-activity-logs.tsx";
import PageLayout_35 from "./pages/admin-activity-logs.pageLayout.tsx";
import Page_36 from "./pages/analytics-dashboard.tsx";
import PageLayout_36 from "./pages/analytics-dashboard.pageLayout.tsx";
import Page_37 from "./pages/compliance-calendar.tsx";
import PageLayout_37 from "./pages/compliance-calendar.pageLayout.tsx";
import Page_38 from "./pages/evidence-management.tsx";
import PageLayout_38 from "./pages/evidence-management.pageLayout.tsx";
import Page_39 from "./pages/admin-knowledge-base.tsx";
import PageLayout_39 from "./pages/admin-knowledge-base.pageLayout.tsx";
import Page_40 from "./pages/admin-parser-testing.tsx";
import PageLayout_40 from "./pages/admin-parser-testing.pageLayout.tsx";
import Page_41 from "./pages/creditor-obligations.tsx";
import PageLayout_41 from "./pages/creditor-obligations.pageLayout.tsx";
import Page_42 from "./pages/creditor-validations.tsx";
import PageLayout_42 from "./pages/creditor-validations.pageLayout.tsx";
import Page_43 from "./pages/admin-parser-mappings.tsx";
import PageLayout_43 from "./pages/admin-parser-mappings.pageLayout.tsx";
import Page_44 from "./pages/admin-user-management.tsx";
import PageLayout_44 from "./pages/admin-user-management.pageLayout.tsx";
import Page_45 from "./pages/collector-obligations.tsx";
import PageLayout_45 from "./pages/collector-obligations.pageLayout.tsx";
import Page_46 from "./pages/admin-letter-templates.tsx";
import PageLayout_46 from "./pages/admin-letter-templates.pageLayout.tsx";
import Page_47 from "./pages/enforcement-mechanisms.tsx";
import PageLayout_47 from "./pages/enforcement-mechanisms.pageLayout.tsx";
import Page_48 from "./pages/admin-compliance-config.tsx";
import PageLayout_48 from "./pages/admin-compliance-config.pageLayout.tsx";
import Page_49 from "./pages/admin-version-management.tsx";
import PageLayout_49 from "./pages/admin-version-management.pageLayout.tsx";
import Page_50 from "./pages/identity-theft-protection.tsx";
import PageLayout_50 from "./pages/identity-theft-protection.pageLayout.tsx";
import Page_51 from "./pages/support-tickets.$ticketId.tsx";
import PageLayout_51 from "./pages/support-tickets.$ticketId.pageLayout.tsx";
import Page_52 from "./pages/upload-review.$artifactId.tsx";
import PageLayout_52 from "./pages/upload-review.$artifactId.pageLayout.tsx";
import Page_53 from "./pages/dispute-rotation-analytics.tsx";
import PageLayout_53 from "./pages/dispute-rotation-analytics.pageLayout.tsx";
import Page_54 from "./pages/upload-results.$artifactId.tsx";
import PageLayout_54 from "./pages/upload-results.$artifactId.pageLayout.tsx";
import Page_55 from "./pages/admin-user-management.$userId.tsx";
import PageLayout_55 from "./pages/admin-user-management.$userId.pageLayout.tsx";

if (!window.requestIdleCallback) {
  window.requestIdleCallback = (cb) => {
    return window.setTimeout(() => {
      cb({
        didTimeout: false,
        timeRemaining: () => 0,
      });
    }, 1);
  };
}

import "./base.css";

const fileNameToRoute = new Map([["./pages/login.tsx","/login"],["./pages/_index.tsx","/"],["./pages/upload.tsx","/upload"],["./pages/bureaus.tsx","/bureaus"],["./pages/contact.tsx","/contact"],["./pages/my-info.tsx","/my-info"],["./pages/packets.tsx","/packets"],["./pages/calendar.tsx","/calendar"],["./pages/evidence.tsx","/evidence"],["./pages/progress.tsx","/progress"],["./pages/register.tsx","/register"],["./pages/statutes.tsx","/statutes"],["./pages/try-upload.tsx","/try-upload"],["./pages/my-accounts.tsx","/my-accounts"],["./pages/user-manual.tsx","/user-manual"],["./pages/cases.review.tsx","/cases/review"],["./pages/verify-email.tsx","/verify-email"],["./pages/admin-security.tsx","/admin-security"],["./pages/privacy-policy.tsx","/privacy-policy"],["./pages/reset-password.tsx","/reset-password"],["./pages/tradelines-tab.tsx","/tradelines-tab"],["./pages/tradelines.$id.tsx","/tradelines/:id"],["./pages/evidence-events.tsx","/evidence-events"],["./pages/support-tickets.tsx","/support-tickets"],["./pages/admin-error-logs.tsx","/admin-error-logs"],["./pages/change-detection.tsx","/change-detection"],["./pages/compliance-audit.tsx","/compliance-audit"],["./pages/profile-settings.tsx","/profile-settings"],["./pages/report-artifacts.tsx","/report-artifacts"],["./pages/terms-of-service.tsx","/terms-of-service"],["./pages/deadline-calendar.tsx","/deadline-calendar"],["./pages/metro2-compliance.tsx","/metro2-compliance"],["./pages/bankruptcy-tracker.tsx","/bankruptcy-tracker"],["./pages/bureau-obligations.tsx","/bureau-obligations"],["./pages/regulatory-updates.tsx","/regulatory-updates"],["./pages/admin-activity-logs.tsx","/admin-activity-logs"],["./pages/analytics-dashboard.tsx","/analytics-dashboard"],["./pages/compliance-calendar.tsx","/compliance-calendar"],["./pages/evidence-management.tsx","/evidence-management"],["./pages/admin-knowledge-base.tsx","/admin-knowledge-base"],["./pages/admin-parser-testing.tsx","/admin-parser-testing"],["./pages/creditor-obligations.tsx","/creditor-obligations"],["./pages/creditor-validations.tsx","/creditor-validations"],["./pages/admin-parser-mappings.tsx","/admin-parser-mappings"],["./pages/admin-user-management.tsx","/admin-user-management"],["./pages/collector-obligations.tsx","/collector-obligations"],["./pages/admin-letter-templates.tsx","/admin-letter-templates"],["./pages/enforcement-mechanisms.tsx","/enforcement-mechanisms"],["./pages/admin-compliance-config.tsx","/admin-compliance-config"],["./pages/admin-version-management.tsx","/admin-version-management"],["./pages/identity-theft-protection.tsx","/identity-theft-protection"],["./pages/support-tickets.$ticketId.tsx","/support-tickets/:ticketId"],["./pages/upload-review.$artifactId.tsx","/upload-review/:artifactId"],["./pages/dispute-rotation-analytics.tsx","/dispute-rotation-analytics"],["./pages/upload-results.$artifactId.tsx","/upload-results/:artifactId"],["./pages/admin-user-management.$userId.tsx","/admin-user-management/:userId"]]);
const fileNameToComponent = new Map([
    ["./pages/login.tsx", Page_0],
["./pages/_index.tsx", Page_1],
["./pages/upload.tsx", Page_2],
["./pages/bureaus.tsx", Page_3],
["./pages/contact.tsx", Page_4],
["./pages/my-info.tsx", Page_5],
["./pages/packets.tsx", Page_6],
["./pages/calendar.tsx", Page_7],
["./pages/evidence.tsx", Page_8],
["./pages/progress.tsx", Page_9],
["./pages/register.tsx", Page_10],
["./pages/statutes.tsx", Page_11],
["./pages/try-upload.tsx", Page_12],
["./pages/my-accounts.tsx", Page_13],
["./pages/user-manual.tsx", Page_14],
["./pages/cases.review.tsx", Page_15],
["./pages/verify-email.tsx", Page_16],
["./pages/admin-security.tsx", Page_17],
["./pages/privacy-policy.tsx", Page_18],
["./pages/reset-password.tsx", Page_19],
["./pages/tradelines-tab.tsx", Page_20],
["./pages/tradelines.$id.tsx", Page_21],
["./pages/evidence-events.tsx", Page_22],
["./pages/support-tickets.tsx", Page_23],
["./pages/admin-error-logs.tsx", Page_24],
["./pages/change-detection.tsx", Page_25],
["./pages/compliance-audit.tsx", Page_26],
["./pages/profile-settings.tsx", Page_27],
["./pages/report-artifacts.tsx", Page_28],
["./pages/terms-of-service.tsx", Page_29],
["./pages/deadline-calendar.tsx", Page_30],
["./pages/metro2-compliance.tsx", Page_31],
["./pages/bankruptcy-tracker.tsx", Page_32],
["./pages/bureau-obligations.tsx", Page_33],
["./pages/regulatory-updates.tsx", Page_34],
["./pages/admin-activity-logs.tsx", Page_35],
["./pages/analytics-dashboard.tsx", Page_36],
["./pages/compliance-calendar.tsx", Page_37],
["./pages/evidence-management.tsx", Page_38],
["./pages/admin-knowledge-base.tsx", Page_39],
["./pages/admin-parser-testing.tsx", Page_40],
["./pages/creditor-obligations.tsx", Page_41],
["./pages/creditor-validations.tsx", Page_42],
["./pages/admin-parser-mappings.tsx", Page_43],
["./pages/admin-user-management.tsx", Page_44],
["./pages/collector-obligations.tsx", Page_45],
["./pages/admin-letter-templates.tsx", Page_46],
["./pages/enforcement-mechanisms.tsx", Page_47],
["./pages/admin-compliance-config.tsx", Page_48],
["./pages/admin-version-management.tsx", Page_49],
["./pages/identity-theft-protection.tsx", Page_50],
["./pages/support-tickets.$ticketId.tsx", Page_51],
["./pages/upload-review.$artifactId.tsx", Page_52],
["./pages/dispute-rotation-analytics.tsx", Page_53],
["./pages/upload-results.$artifactId.tsx", Page_54],
["./pages/admin-user-management.$userId.tsx", Page_55],
  ]);

function makePageRoute(filename: string) {
  const Component = fileNameToComponent.get(filename);
  return <Component />;
}

function toElement({
  trie,
  fileNameToRoute,
  makePageRoute,
}: {
  trie: LayoutTrie;
  fileNameToRoute: Map<string, string>;
  makePageRoute: (filename: string) => React.ReactNode;
}) {
  return [
    ...trie.topLevel.map((filename) => (
      <Route
        key={fileNameToRoute.get(filename)}
        path={fileNameToRoute.get(filename)}
        element={makePageRoute(filename)}
      />
    )),
    ...Array.from(trie.trie.entries()).map(([Component, child], index) => (
      <Route
        key={index}
        element={
          <Component>
            <Outlet />
          </Component>
        }
      >
        {toElement({ trie: child, fileNameToRoute, makePageRoute })}
      </Route>
    )),
  ];
}

type LayoutTrieNode = Map<
  React.ComponentType<{ children: React.ReactNode }>,
  LayoutTrie
>;
type LayoutTrie = { topLevel: string[]; trie: LayoutTrieNode };
function buildLayoutTrie(layouts: {
  [fileName: string]: React.ComponentType<{ children: React.ReactNode }>[];
}): LayoutTrie {
  const result: LayoutTrie = { topLevel: [], trie: new Map() };
  Object.entries(layouts).forEach(([fileName, components]) => {
    let cur: LayoutTrie = result;
    for (const component of components) {
      if (!cur.trie.has(component)) {
        cur.trie.set(component, {
          topLevel: [],
          trie: new Map(),
        });
      }
      cur = cur.trie.get(component)!;
    }
    cur.topLevel.push(fileName);
  });
  return result;
}

function NotFound() {
  return (
    <div>
      <h1>Not Found</h1>
      <p>The page you are looking for does not exist.</p>
      <p>Go back to the <a href="/" style={{ color: 'blue' }}>home page</a>.</p>
    </div>
  );
}

import { useLocation, useNavigationType } from "react-router-dom";

export default function ScrollManager() {
  const { pathname, search, hash } = useLocation();
  const navType = useNavigationType(); // "PUSH" | "REPLACE" | "POP"

  useEffect(() => {
    // Back/forward: keep browser-like behavior
    if (navType === "POP") return;

    // Hash links: let the browser scroll to the anchor
    if (hash) return;

    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, search, hash, navType]);

  return null;
}

export function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: false, v7_relativeSplatPath: false }}>
      <ScrollManager />
      <GlobalContextProviders>
        <Routes>
          {toElement({ trie: buildLayoutTrie({
"./pages/login.tsx": PageLayout_0,
"./pages/_index.tsx": PageLayout_1,
"./pages/upload.tsx": PageLayout_2,
"./pages/bureaus.tsx": PageLayout_3,
"./pages/contact.tsx": PageLayout_4,
"./pages/my-info.tsx": PageLayout_5,
"./pages/packets.tsx": PageLayout_6,
"./pages/calendar.tsx": PageLayout_7,
"./pages/evidence.tsx": PageLayout_8,
"./pages/progress.tsx": PageLayout_9,
"./pages/register.tsx": PageLayout_10,
"./pages/statutes.tsx": PageLayout_11,
"./pages/try-upload.tsx": PageLayout_12,
"./pages/my-accounts.tsx": PageLayout_13,
"./pages/user-manual.tsx": PageLayout_14,
"./pages/cases.review.tsx": PageLayout_15,
"./pages/verify-email.tsx": PageLayout_16,
"./pages/admin-security.tsx": PageLayout_17,
"./pages/privacy-policy.tsx": PageLayout_18,
"./pages/reset-password.tsx": PageLayout_19,
"./pages/tradelines-tab.tsx": PageLayout_20,
"./pages/tradelines.$id.tsx": PageLayout_21,
"./pages/evidence-events.tsx": PageLayout_22,
"./pages/support-tickets.tsx": PageLayout_23,
"./pages/admin-error-logs.tsx": PageLayout_24,
"./pages/change-detection.tsx": PageLayout_25,
"./pages/compliance-audit.tsx": PageLayout_26,
"./pages/profile-settings.tsx": PageLayout_27,
"./pages/report-artifacts.tsx": PageLayout_28,
"./pages/terms-of-service.tsx": PageLayout_29,
"./pages/deadline-calendar.tsx": PageLayout_30,
"./pages/metro2-compliance.tsx": PageLayout_31,
"./pages/bankruptcy-tracker.tsx": PageLayout_32,
"./pages/bureau-obligations.tsx": PageLayout_33,
"./pages/regulatory-updates.tsx": PageLayout_34,
"./pages/admin-activity-logs.tsx": PageLayout_35,
"./pages/analytics-dashboard.tsx": PageLayout_36,
"./pages/compliance-calendar.tsx": PageLayout_37,
"./pages/evidence-management.tsx": PageLayout_38,
"./pages/admin-knowledge-base.tsx": PageLayout_39,
"./pages/admin-parser-testing.tsx": PageLayout_40,
"./pages/creditor-obligations.tsx": PageLayout_41,
"./pages/creditor-validations.tsx": PageLayout_42,
"./pages/admin-parser-mappings.tsx": PageLayout_43,
"./pages/admin-user-management.tsx": PageLayout_44,
"./pages/collector-obligations.tsx": PageLayout_45,
"./pages/admin-letter-templates.tsx": PageLayout_46,
"./pages/enforcement-mechanisms.tsx": PageLayout_47,
"./pages/admin-compliance-config.tsx": PageLayout_48,
"./pages/admin-version-management.tsx": PageLayout_49,
"./pages/identity-theft-protection.tsx": PageLayout_50,
"./pages/support-tickets.$ticketId.tsx": PageLayout_51,
"./pages/upload-review.$artifactId.tsx": PageLayout_52,
"./pages/dispute-rotation-analytics.tsx": PageLayout_53,
"./pages/upload-results.$artifactId.tsx": PageLayout_54,
"./pages/admin-user-management.$userId.tsx": PageLayout_55,
}), fileNameToRoute, makePageRoute })} 
          <Route path="*" element={<NotFound />} />
        </Routes>
      </GlobalContextProviders>
    </BrowserRouter>
  );
}
