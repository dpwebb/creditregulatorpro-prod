---
created: 2026-04-18T04:17:50.551Z
updated: 2026-04-18T04:17:50.551Z
---

# Function-Level "Promised vs. Delivered" Semantic Audit

## Summary

The previous Level 10 diagnostic verified infrastructure integrity (FK checks, indexes, endpoint HTTP status codes, console errors) but missed **semantic correctness** — whether the data returned by endpoints actually matches the ground-truth database state. This allowed the `processingStatus` filter gap (failed uploads counted as completed) to go undetected.

This plan adds a comprehensive admin-only diagnostic that cross-validates what every user-facing endpoint **reports** against the **actual database state**, catching:
- Count mismatches (endpoint says 4 artifacts, but only 0 are truly completed)
- Progress/step inaccuracies (journey tracker shows Step 1 done when it isn't)
- Missing `processingStatus` filters across endpoints
- Role-based data leakage (user A seeing user B's data)
- Stale/orphan data (packets referencing deleted tradelines, etc.)

## Approach

### Step 1: Create `helpers/semanticAuditRunner`

Core audit engine that runs server-side. For a given user ID (or all users), it performs:

**Category A — Count Consistency**
For each user, call the relevant list/stats endpoints' SQL logic directly and compare against ground-truth queries:
| Endpoint field | Ground truth |
|---|---|
| `dashboard/stats → totalReportArtifacts` | `COUNT(*) FROM report_artifact WHERE user_id=? AND processing_status='completed'` |
| `dashboard/stats → totalTradelines` | `COUNT(*) FROM tradeline WHERE user_id=?` |
| `dashboard/stats → totalPackets` | `COUNT(*) FROM packet WHERE user_id=? AND processing_status='completed'` |
| `dashboard/stats → totalObligations` | `COUNT(*) FROM obligation_instance WHERE user_id=?` |
| `report-artifact/list → artifacts.length` | Same as totalReportArtifacts ground truth |
| `packet/list → packets.length` | Same as totalPackets ground truth |
| `tradeline/list → tradelines.length` | Same as totalTradelines ground truth |

**Category B — Progress/Step Accuracy**
Compute journey step states (mirrors DisputeJourneyTracker logic server-side):
- Step 1 = completed artifacts > 0
- Step 2 = tradelines > 0  
- Step 3 = completed packets > 0
- Step 4 = packet with status 'sent' or 'completed'
- Step 5 = obligation instance with response_received_date IS NOT NULL
- Step 6 = completed artifacts > 1

Compare against what dashboard/stats would produce. Flag mismatches.

**Category C — Filter Parity**
Verify ALL packet/artifact-related endpoints apply `processingStatus = 'completed'` for non-admin users:
- `report-artifact/list_GET`
- `packet/list_GET`
- `dashboard/stats_GET`
- `packet/recommend_GET`
- `packet/impact_GET`
- `hidden-risk/list_GET`
- `success/analytics_GET`
- `packet/compliance-audit_GET`
- `packet/compliance-calendar_GET`

For each, run the query both with and without the filter and flag if results differ (meaning non-completed records exist and could leak).

**Category D — Role-Based Data Isolation**
For each non-admin user, verify:
- No packets belonging to other users in their filtered results
- No tradelines from other users
- No report artifacts from other users
- Dashboard stats reflect only their data

**Category E — Orphan/Stale Data**
- Tradelines referencing non-existent report artifacts
- Obligation instances referencing non-existent tradelines
- Packets referencing non-existent tradelines
- Evidence events referencing non-existent obligation instances
- Packets with status='ready to mail' but processingStatus != 'completed'

Returns structured report:
```typescript
type AuditFinding = {
  category: 'COUNT_MISMATCH' | 'PROGRESS_INACCURACY' | 'FILTER_PARITY' | 'DATA_LEAKAGE' | 'ORPHAN_DATA';
  severity: 'critical' | 'warning' | 'info';
  endpoint: string;
  field: string;
  expected: string | number;
  actual: string | number;
  userId?: number;
  description: string;
};

type AuditReport = {
  runAt: string;
  totalChecks: number;
  passed: number;
  failed: number;
  findings: AuditFinding[];
};
```

### Step 2: Create `endpoints/admin/diagnostic/semantic-audit_POST`

Admin-only endpoint that:
- Accepts optional `userId` param (defaults to auditing all users, with LIMIT for safety)
- Calls `semanticAuditRunner`
- Returns the `AuditReport`

### Step 3: Add UI to admin-security page

Add a "Semantic Audit" section with:
- "Run Full Audit" button (all users) and "Audit Specific User" option
- Summary cards: total checks, passed, failed, by category
- Findings table with severity badges, category filters, and expandable details
- Ability to export findings as JSON

## Files to Create

| File | Purpose |
|---|---|
| `helpers/semanticAuditRunner` | Core audit engine running all 5 check categories |
| `endpoints/admin/diagnostic/semantic-audit_POST` | Admin-only trigger endpoint |

## Files to Modify

| File | Change |
|---|---|
| `pages/admin-security.tsx` | Add "Semantic Audit" section with trigger button and results display |

## Risks & Considerations

1. **Performance**: Running across all users with many records could be slow. Scope by userId when possible, and use LIMIT for the "all users" mode.
2. **Admin-only**: Strictly gated — reads across all user data.
3. **Maintenance**: When new `processingStatus`-gated entities are added, the audit runner must be updated. Include a maintenance note in the helper.
4. **Backward compatible**: New endpoint and additive UI change only. No existing API contracts modified.
5. **Filter gap check during build**: Before building, verify whether `packet/recommend_GET`, `packet/impact_GET`, `hidden-risk/list_GET`, `success/analytics_GET`, `packet/compliance-audit_GET`, `packet/compliance-calendar_GET` are missing `processingStatus` filters for non-admin users. If so, fix them as part of this plan.
6. **Not a replacement for unit tests**: This is a runtime diagnostic against live data, complementing (not replacing) automated tests.
