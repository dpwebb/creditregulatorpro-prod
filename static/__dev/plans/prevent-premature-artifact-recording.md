---
created: 2026-04-18T03:58:01.150Z
updated: 2026-04-18T03:58:01.150Z
---

# Prevent Premature Artifact Recording

## Summary
Failed uploads (e.g. DocStrange 429 velocity errors) currently show up in the user's "Your Files" list because `report_artifact` records are created **before** extraction and parsing complete. This plan adds a proper `processing_status` column to `report_artifact` so only fully-completed artifacts appear to users.

## Current Problem
1. Phase 1 (`ingest/report_POST`) calls `createReportArtifact()` which inserts a row into `report_artifact` **immediately** — before DocStrange even responds.
2. When DocStrange fails (429), the record stays in the DB with `extractionStatus: "failed"` buried in the JSON `data` column.
3. `report-artifact/list_GET` returns **all** artifacts with no status filtering.
4. Result: 3 failed uploads (IDs 199, 200, 201) appear as valid files in the user's account.

## Database Changes
Add a `processing_status` column to `report_artifact`:
```sql
ALTER TABLE report_artifact 
ADD COLUMN processing_status VARCHAR(20) NOT NULL DEFAULT 'pending';
```
Valid values: `pending`, `extracting`, `processing`, `completed`, `failed`

Also add an index for efficient filtering:
```sql
CREATE INDEX idx_report_artifact_processing_status ON report_artifact(processing_status);
```

Update existing rows:
- Set the 4 most recent failed artifacts (IDs 198-201) to `failed`
- Set all other existing artifacts (that were created before this column existed and completed successfully) to `completed`

## Files to Modify

### 1. `helpers/ingestArtifactCreator.tsx`
- Set `processing_status: 'pending'` when inserting the artifact record (it's the column default, but be explicit).

### 2. `helpers/ingestReportHandler.tsx`
**In `handleIngestSubmit` (Phase 1):**
- After successful DocStrange submission, update status to `extracting`
- On DocStrange failure (429, etc.), update status to `failed`

**In `handleIngestProcess` (Phase 2):**
- At the start of processing, update status to `processing`
- At the very end (just before the `complete` SSE event), update status to `completed`
- On any fatal error that aborts processing, update status to `failed`

### 3. `endpoints/report-artifact/list_GET.ts`
- Add a `WHERE processing_status = 'completed'` filter for non-admin users
- For admin users, return all artifacts but include the `processing_status` field so admins can see which are incomplete
- Add `processing_status` to the selected columns

### 4. `endpoints/report-artifact/list_GET.schema.ts`
- Add `processingStatus` to the `ReportArtifactListItem` type

### 5. `endpoints/ingest/anonymous-report_POST.ts`
- Set `processing_status: 'pending'` on artifact creation
- Update to `extracting` before DocStrange call
- Update to `completed` after successful parsing (since anonymous flow does everything in one endpoint)
- Update to `failed` on errors (and clean up / delete the failed artifact if appropriate)

### 6. `helpers/schema.tsx` (auto-updated by pullSQLDatabaseSchema after ALTER TABLE)

## Files to Create
None — this is purely modifying existing files and the database schema.

## Approach

### Step 1: Database Migration
Run ALTER TABLE to add the `processing_status` column with a default of `'pending'`. Then backfill:
- Mark existing completed artifacts as `'completed'`
- Mark the 4 known failed ones (198–201) as `'failed'`

### Step 2: Update Artifact Creator
Modify `createReportArtifact` to explicitly set `processing_status: 'pending'`.

### Step 3: Update Ingestion Handler
Add status transitions throughout the pipeline:
- `pending` → `extracting` (after DocStrange submission)
- `extracting` → `processing` (at start of Phase 2)
- `processing` → `completed` (at end of successful Phase 2)
- Any stage → `failed` (on fatal errors)

### Step 4: Update List Endpoint
Filter out non-completed artifacts for regular users. Include `processing_status` in the response for admin visibility.

### Step 5: Update Anonymous Upload
Apply the same status lifecycle to the anonymous ingestion flow.

### Step 6: Pull Schema
Run `pullSQLDatabaseSchema` to update the TypeScript schema with the new column.

## Risks & Considerations
- **Backward compatibility**: The new column has a default value (`'pending'`), so existing code that inserts without specifying it won't break. The list endpoint change only adds a WHERE clause, so the response shape is additive (new field). The mobile app's existing endpoints remain compatible.
- **Existing data**: All pre-existing artifacts that completed successfully need to be backfilled to `'completed'` so they don't disappear from users' views.
- **Anonymous uploads**: The anonymous flow also creates artifacts; it needs the same treatment to avoid orphaned records.
- **Edge case — Phase 2 timeout**: If Phase 2 times out (EXTRACTION_TIMEOUT), the status should stay as `extracting` (not `failed`) since the client can retry. Only mark `failed` for non-retryable errors.
- **Cleanup consideration**: Failed artifacts still contain base64 file data in `storage_url`. A future retention job could purge failed artifacts older than 24 hours to reclaim space. Not in scope for this plan.
