---
created: 2026-04-20T17:34:48.367Z
updated: 2026-04-20T17:34:48.367Z
---

# Admin Bureau-Specific Parser Mapping & Injection Configuration UI

## Summary
Build an admin-facing UI that exposes and allows configuration of the bureau-specific parsing and field injection mappings used during credit report ingestion. The current hardcoded pipeline remains the **default baseline** — admin-configured mappings act as **overrides** that take effect only when explicitly created and activated through the UI. No changes are made to the ingestion scheme unless the admin deliberately modifies a mapping.

This follows the **Override Layer Pattern**: the existing parsers (`transunionHtmlParser`, `equifaxReportParser`, `docstrangeParser`) continue to function identically. A new `parserMappingEngine` helper checks for active DB-stored overrides at mapping time and applies them selectively.

---

## Database Schema Changes

### New Tables

#### `parser_field_mapping`
Stores individual field mapping overrides per bureau.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | |
| `bureau` | text NOT NULL | "TransUnion" or "Equifax" |
| `source_path` | text NOT NULL | JSON path in LLMResponse (e.g., `tradelines[].creditorName`, `consumerInfo.fullName`) |
| `target_field` | text NOT NULL | Target field in ComprehensiveParseResult / ParsedTradeline (e.g., `creditorName`, `dates.opened`) |
| `section` | text NOT NULL | Section category: "tradeline", "consumer_info", "inquiry", "public_record", "employment", "metadata" |
| `transform_type` | text NOT NULL | Transform to apply: "direct", "date_parse", "numeric", "regex_extract", "uppercase", "lowercase", "boolean", "fallback_chain" |
| `transform_config` | jsonb | Config for the transform (e.g., date format string, regex pattern, fallback field list) |
| `is_active` | boolean DEFAULT false | Only active mappings are applied during ingestion |
| `priority` | integer DEFAULT 0 | Higher priority overrides take precedence when multiple mappings target the same field |
| `description` | text | Human-readable description of what this mapping does |
| `created_by` | integer REFERENCES user_account(id) | Admin who created |
| `created_at` | timestamptz DEFAULT now() | |
| `updated_at` | timestamptz DEFAULT now() | |

**Indexes**: `(bureau, section, is_active)`, `(bureau, target_field)`

#### `parser_mapping_version`
Audit trail for mapping changes with rollback support.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | |
| `mapping_id` | integer REFERENCES parser_field_mapping(id) ON DELETE CASCADE | |
| `version_number` | integer NOT NULL | Auto-incrementing per mapping |
| `previous_state` | jsonb | Full snapshot of the mapping before this change |
| `new_state` | jsonb | Full snapshot of the mapping after this change |
| `change_type` | text NOT NULL | "created", "updated", "activated", "deactivated", "deleted" |
| `changed_by` | integer REFERENCES user_account(id) | |
| `changed_at` | timestamptz DEFAULT now() | |
| `notes` | text | Optional admin notes explaining the change |

**Index**: `(mapping_id, version_number)`

#### `parser_bureau_detection_config`
Configurable bureau detection marker weights (optional enhancement).

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | |
| `bureau` | text NOT NULL | "TransUnion" or "Equifax" |
| `marker` | text NOT NULL | The detection marker string (e.g., "TRANSUNION", "TU CASE ID", "H1S 2Z2") |
| `weight` | integer NOT NULL DEFAULT 50 | Detection weight for this marker |
| `is_active` | boolean DEFAULT true | |
| `created_by` | integer REFERENCES user_account(id) | |
| `updated_at` | timestamptz DEFAULT now() | |

**Unique constraint**: `(bureau, marker)`

---

## Files to Create

### Endpoints (7 new)

1. **`endpoints/parser-mapping/list_GET`** — List all field mappings, filterable by bureau and section. Returns the full mapping list with version info. Also returns a "defaults" section showing the current hardcoded mappings for reference.

2. **`endpoints/parser-mapping/create_POST`** — Create a new field mapping override. Auto-creates a version record. Validates that `source_path` and `target_field` are valid paths in the respective types.

3. **`endpoints/parser-mapping/update_POST`** — Update an existing mapping. Creates a version snapshot before applying changes.

4. **`endpoints/parser-mapping/delete_POST`** — Soft-delete a mapping (deactivate + mark deleted). Creates version record.

5. **`endpoints/parser-mapping/test_POST`** — Accept a mapping config + sample HTML/raw text, run it through the mapping engine, and return the resulting parsed output alongside what the default hardcoded parser would produce. This is the "preview before activation" feature.

6. **`endpoints/parser-mapping/history_GET`** — Get version history for a specific mapping or all mappings, with diff details.

7. **`endpoints/parser-mapping/rollback_POST`** — Rollback a mapping to a previous version by version ID.

### Helpers (3 new)

8. **`helpers/parserMappingEngine`** — Core override engine:
   - `loadActiveMappings(bureau: string)`: Loads all active overrides for a bureau from DB
   - `applyOverrides(llmResponse: LLMResponse, bureau: string)`: Applies active overrides to an LLMResponse before it reaches `mapDocStrangeResponseToResult`
   - `getDefaultMappings(bureau: string)`: Returns a structured representation of the current hardcoded mappings (introspected from `docstrangeParser` and bureau-specific parsers) for the UI to display
   - `executeTransform(value: any, transformType: string, config: any)`: Executes a single transform (date_parse, regex_extract, etc.)
   - Transform types supported: `direct` (pass-through), `date_parse` (with configurable format), `numeric` (strip non-numeric, parse), `regex_extract` (with capture group), `uppercase`/`lowercase`, `boolean` (truthy check), `fallback_chain` (try multiple source paths in order)

9. **`helpers/parserMappingQueries`** — React Query hooks for all parser mapping endpoints (list, create, update, delete, test, history, rollback).

10. **`helpers/parserMappingDefaults`** — Static registry of all current hardcoded mapping definitions, organized by bureau and section. This provides the "read-only view of current mappings" without needing to reverse-engineer the parser code at runtime. Structure:
    ```ts
    {
      TransUnion: {
        tradeline: [
          { sourcePath: "creditorName", targetField: "creditorName", transformType: "direct", description: "Creditor name" },
          { sourcePath: "dateOpened || openedDate", targetField: "dates.opened", transformType: "date_parse", description: "Date account opened" },
          ...
        ],
        consumer_info: [...],
        inquiry: [...],
        ...
      },
      Equifax: { ... }
    }
    ```

### Components (5 new)

11. **`components/ParserMappingTable`** — Main table displaying all field mappings for a selected bureau/section. Shows source path, target field, transform type, active/inactive status, priority. Supports inline editing of simple fields.

12. **`components/ParserMappingEditor`** — Sheet/dialog for creating or editing a single field mapping. Includes:
    - Bureau selector (TransUnion / Equifax)
    - Section selector (tradeline, consumer_info, inquiry, etc.)
    - Source path input with autocomplete from LLMResponse type keys
    - Target field input with autocomplete from ParsedTradeline / ComprehensiveParseResult keys
    - Transform type selector with dynamic config form per type
    - Priority input
    - Description field
    - Active/inactive toggle

13. **`components/ParserMappingTestPanel`** — Test harness panel:
    - Upload or paste sample HTML
    - Select which mappings to test (or test all active)
    - Side-by-side comparison: "Default Parser Output" vs "With Overrides Applied"
    - Diff highlighting for changed fields
    - "Activate" button if test results look correct

14. **`components/ParserMappingHistory`** — Version history viewer for mappings:
    - Timeline of changes per mapping
    - Diff view (before/after)
    - Rollback button per version
    - Filter by bureau, section, date range

15. **`components/BureauDetectionConfigPanel`** — Bureau detection marker configuration:
    - Table of markers per bureau with weights
    - Add/edit/remove markers
    - Test detection: paste HTML and see which bureau is detected with score breakdown

### Pages (1 new)

16. **`pages/admin-parser-mappings`** — Admin page with tabs:
    - **Field Mappings** tab: `ParserMappingTable` + `ParserMappingEditor` for CRUD
    - **Test Harness** tab: `ParserMappingTestPanel`
    - **Change History** tab: `ParserMappingHistory`
    - **Bureau Detection** tab: `BureauDetectionConfigPanel`
    - Page layout: `AdminRoute` + `AppLayout` (same as other admin pages)

---

## Files to Modify

### Core Pipeline Integration (2 files)

17. **`helpers/docstrangeParser`** — Modify `mapDocStrangeResponseToResult` to accept an optional `overrides` parameter. When overrides are provided, apply them to the LLMResponse fields before the hardcoded mapping runs. This is a minimal, surgical change:
    - Add optional second parameter: `overrides?: ParserFieldMapping[]`
    - At the top of the function, if overrides exist, apply them to `docStrangeData` via `parserMappingEngine.applyOverrides()`
    - All existing hardcoded logic runs on the (potentially modified) data as before
    - **If no overrides are passed, behavior is 100% identical to current**

18. **`helpers/bureauDetectionRouter`** — Modify `routeHtmlToLLMResponse` and `routeHtmlToComprehensiveResult` to:
    - After detecting bureau, load active mappings from DB via `parserMappingEngine.loadActiveMappings(bureau)`
    - Pass loaded overrides to `mapDocStrangeResponseToResult`
    - Optionally check `parser_bureau_detection_config` for custom marker weights before using hardcoded defaults
    - **If no active mappings exist in DB, behavior is 100% identical to current**

### Navigation (1 file)

19. **`components/AppSidebarNavigation`** — Add "Parser Mappings" link under the admin section, near the existing "Parser Testing" link.

---

## Approach

### Step 1: Database Schema
Run SQL to create the three new tables (`parser_field_mapping`, `parser_mapping_version`, `parser_bureau_detection_config`) with proper indexes and constraints. Pull schema.

### Step 2: Core Engine Helper
Create `helpers/parserMappingEngine` with:
- Transform execution logic (date parsing, regex, numeric, etc.)
- Override loading from DB
- Override application to LLMResponse
- Default mapping introspection

Create `helpers/parserMappingDefaults` with the static registry of all hardcoded mappings for both bureaus, organized by section.

### Step 3: Endpoints + Query Hooks
Create all 7 endpoints and `helpers/parserMappingQueries` in one batch. All endpoints are admin-only (check session role === "admin").

### Step 4: Pipeline Integration
Modify `docstrangeParser` and `bureauDetectionRouter` to support the override layer. This is the only change to the existing ingestion flow, and it's a no-op when no overrides exist.

### Step 5: UI Components
Create the 5 new components (`ParserMappingTable`, `ParserMappingEditor`, `ParserMappingTestPanel`, `ParserMappingHistory`, `BureauDetectionConfigPanel`).

### Step 6: Admin Page + Navigation
Create `pages/admin-parser-mappings` with tabbed layout. Add sidebar link.

### Step 7: Validation & Testing
- Test with no active mappings → ingestion must behave identically to current
- Test with a simple override (e.g., remap a date format) → verify override applies correctly
- Test the test harness with sample HTML → verify side-by-side comparison works
- Test rollback → verify version history and rollback function correctly

---

## Risks & Considerations

### 1. Backward Compatibility (Critical)
- **This project is deployed as a native mobile app** — all endpoint input/output shapes must remain unchanged
- The override layer is purely additive: `docstrangeParser.mapDocStrangeResponseToResult()` gains an optional parameter; without it, the function signature is backward compatible
- No existing endpoints are modified; all new endpoints are admin-only

### 2. Misconfiguration Risk
- An admin could create an override that maps balance to a date field, producing bad data
- **Mitigations**:
  - Type validation in `parserMappingEngine.executeTransform()` — if transform output doesn't match expected type, log a warning and fall back to hardcoded default
  - Mandatory test-run before activation (UI enforces this flow)
  - One-click rollback in version history
  - Admin audit trail for all changes

### 3. Performance Impact
- Each ingestion adds one DB query to load active mappings (~5ms)
- Mappings are loaded once per ingestion, not per tradeline
- If this becomes a concern, add in-memory caching with a short TTL (e.g., 60 seconds)

### 4. Default Mapping Maintenance
- `parserMappingDefaults` is a static file that must be manually kept in sync with any future changes to `docstrangeParser`, `transunionHtmlParser`, or `equifaxReportParser`
- This is acceptable because parser changes are infrequent and always developer-driven
- The test harness helps verify that defaults still match actual behavior

### 5. Complexity of Transform Types
- Start with the 7 listed transform types; avoid over-engineering
- `fallback_chain` is the most complex (try field A, then B, then C) — this mirrors existing hardcoded fallback logic in `docstrangeParser` (e.g., `t.dateOpened || t.openedDate`)
- Regex transforms should be sandboxed (try/catch) to prevent crashes from bad patterns

### 6. Bureau Detection Config
- Making bureau detection weights configurable is lower priority than field mapping
- Incorrect weights could cause reports to be routed to the wrong parser entirely
- **Mitigation**: The test panel lets admins paste HTML and see detection results before saving changes
- Consider adding a "lock" feature that prevents changes to detection weights without a secondary admin confirmation

### 7. Existing Parser Testing Integration
- The existing `admin-parser-testing` page tests parser output against expected values
- Parser mapping overrides will affect those test results
- The test harness in the new page is specifically designed to preview override effects before activation, which complements the existing regression test suite
