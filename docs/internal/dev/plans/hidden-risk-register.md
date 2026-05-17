---
created: 2026-04-16T13:34:34.160Z
updated: 2026-04-16T13:44:41.356Z
---

# Hidden Risk Register

## Summary
Add a **Hidden Risk Widget** to the main dashboard (`pages/_index`) that surfaces concealed/manipulative compliance violations across all of a user's tradelines. Instead of a full page, this is a traffic-light card on the dashboard that links into individual tradeline pages when tapped.

The widget focuses on 12 violation categories representing deliberate manipulation:
ZOMBIE_DEBT_RESURRECTION, PHANTOM_DEBT_UNVERIFIABLE, STALE_REPORTING_FAILURE, CLOSED_ACCOUNT_BALANCE_INFLATION, LAST_ACTIVITY_DATE_MANIPULATION, RETROACTIVE_HISTORY_MANIPULATION, CONSUMER_STATEMENT_SUPPRESSION, INVESTIGATION_RUBBER_STAMP, FURNISHER_POST_DISPUTE_RETALIATION, FURNISHER_REAGING_VIOLATION, COLLECTOR_STATUTE_REVIVAL_ATTEMPT, TEMPORAL_MANIPULATION

## Files to Create

### 1. `endpoints/hidden-risk/list_GET` (.ts + .schema.ts)
- Authenticated endpoint (user, admin, or support)
- For **user** role: queries `creditor_obligation_test` joined with `tradeline` WHERE `tradeline.user_id = session.userId` AND `violation_category` IN the 12 hidden risk categories
- For **admin/support** role: optionally accepts `?userId=X` query param
- Returns: array of risk items (violation id, violationCategory, severity, userExplanation, recommendedAction, detectedAt, confidence score, tradeline id, creditor name from creditor join, bureau name from bureau join, whether a packet exists for this violation)
- Also returns aggregate: total count, errorCount, warningCount, countWithPacket
- Ordered by severity DESC (ERROR first), then confidence DESC

### 2. `helpers/hiddenRiskQueries` (.tsx)
- React Query hook: `useHiddenRisks(userId?: number)`
- Calls the endpoint schema's fetch helper
- Query key: `["hiddenRisks", userId]`

### 3. `components/HiddenRiskWidget` (.tsx + .module.css)
A dashboard widget component displaying a traffic-light summary of hidden risks.

**User View:**
- Traffic-light indicator (green shield / yellow warning / red alert icon) based on severity of risks found
- Single plain-English sentence:
  - Green: "Your report looks clean — no hidden tricks found! 🎉"
  - Yellow (warnings only): "We spotted 2 things worth checking" 
  - Red (has errors): "3 problems are hiding in your report"
- If risks exist, show the top 1-2 risk items as mini-cards inside the widget, each with:
  - Plain-language one-sentence explanation
  - The creditor name (no account numbers)
  - A "See This Account →" link that navigates to `/tradelines/{tradelineId}`
- If more than 2 risks, show a "+X more" link that expands to show all (simple collapsible, not a new page)
- Loading state: skeleton
- Empty/clean state: green shield with encouraging message

**Admin View:**
- Same widget but shows total hidden risk count across all users
- Links to admin user management for drill-down
- Brief stat breakdown: "12 hidden risks across 5 users (8 errors, 4 warnings)"

## Files to Modify

### 1. `pages/_index.tsx`
- Import HiddenRiskWidget component
- For **user** view: add HiddenRiskWidget after DisputeJourneyTracker
- For **admin** view: add HiddenRiskWidget in the stats section area

## Approach
1. Create the backend endpoint (`hidden-risk/list_GET`) with schema
2. Create the React Query hook (`hiddenRiskQueries`)
3. Create the widget component (`HiddenRiskWidget`)
4. Update the dashboard page to include the widget

Steps 1-3 should be done in a single createItems call. Step 4 is an updateItems call.

## Risks & Considerations
- **Backward compatibility**: Purely additive — new endpoint, new component, new widget placement. No existing behavior changed.
- **Performance**: The query joins `creditor_obligation_test` with `tradeline`, `creditor`, and `bureau`. Should be fast for typical user accounts. The dashboard already fetches stats so one additional query is fine.
- **Empty state**: Users without any compliance scans will see the green "all clear" state, which is accurate — no hidden risks have been detected yet. The widget should not suggest there's a problem when scans haven't run.
- **Cognitive load**: User view intentionally limits to 2 visible risk items. No category names, no scores, no technical details visible. One clear action per risk: "See This Account."
- **Mobile app**: New endpoint is additive. Dashboard update adds a component but doesn't remove anything. Fully backward compatible.
- **Plain language**: All text at Grade 8 reading level per project policy.