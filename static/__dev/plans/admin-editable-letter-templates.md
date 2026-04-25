---
created: 2026-04-20T14:54:40.328Z
updated: 2026-04-20T14:54:40.328Z
---

# Admin-Editable Dispute Letter Templates

## Summary
Allow admins to view, edit, and override the content of all dispute letter templates from the admin UI. Templates are organized into three categories:
1. **Bureau-specific** (Equifax, TransUnion, generic fallback)
2. **Provincial** (Ontario CRA, Nova Scotia CRA, BC CRA, Alberta PIPA, Quebec A-8.2, Manitoba CPA, Saskatchewan CPBPA, NB CRA, PEI CRA, NL CPBPA, Yukon CPA, NWT CPA, Nunavut CPA)
3. **Violation-type narratives** (framing subject/intro per violation category, and requested-action text per violation category)

Admins can edit individual letter sections (subject, introduction, statutory grounds, requested action, certification, closing, etc.) **and** optionally override the entire letter body as a single text block. DB overrides take precedence; hardcoded defaults remain as fallback.

## Database Schema

### New table: `letter_template`
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| category | enum('bureau', 'provincial', 'violation_narrative') | Which template family |
| template_key | varchar(100) | Unique key, e.g. "equifax", "ontario_cra", "balance_calculation_violation" |
| label | varchar(255) | Human-readable name for admin display |
| subject | text NULL | Override for subject line |
| introduction | text NULL | Override for introduction paragraph |
| statutory_grounds | text NULL | Override for statutory grounds section |
| requested_action | text NULL | Override for requested action section |
| statutory_timeframe | text NULL | Override for statutory timeframe |
| consumer_statement_right | text NULL | Override for consumer statement right |
| certification | text NULL | Override for certification text |
| closing | text NULL | Override for closing (e.g. "Sincerely,") |
| statutory_reference | text NULL | Override for footer statutory reference |
| source_url | text NULL | Override for footer source URL |
| full_body_override | text NULL | If set, replaces ALL section-level fields with a single block |
| is_active | boolean DEFAULT true | Toggle template on/off |
| updated_at | timestamptz | Last modified |
| updated_by | integer FK → user(id) | Admin who last edited |

**Unique constraint** on (category, template_key).

## Template Keys

### Bureau category
- `equifax` — Equifax Canada dispute template
- `transunion` — TransUnion Canada dispute template
- `generic` — Generic fallback template

### Provincial category
- `ontario_cra`, `nova_scotia_cra`, `bc_cra`, `new_brunswick_cra`, `pei_cra` — CRA provinces
- `manitoba_cpa`, `yukon_cpa`, `nwt_cpa`, `nunavut_cpa` — CPA provinces/territories
- `saskatchewan_cpbpa`, `nl_cpbpa` — CPBPA provinces
- `quebec_a82` — Quebec Credit Agents Act
- `alberta_pipa` — Alberta PIPA

### Violation narrative category
- One key per violation category used in `getDisputeLetterFraming` and `buildBureauRequestedAction`, e.g.:
  - `statute_of_limitations`, `bankruptcy_discharge_violation`, `identity_theft_violation`, `documentation_chain_failure`, `balance_calculation_violation`, `bureau_investigation_failure`, etc.
- Only `subject`, `introduction`, and `requested_action` fields are relevant for this category.

## Files to Create

### `helpers/letterTemplateQueries`
- CRUD functions: `listLetterTemplates`, `getLetterTemplate(category, templateKey)`, `upsertLetterTemplate`, `deleteLetterTemplate`
- `resolveTemplateOverrides(category, templateKey)`: Returns the DB overrides for a given template, or null if none exist / inactive.

### `endpoints/admin/letter-templates_GET`
- List all letter templates, filterable by category. Admin-only.

### `endpoints/admin/letter-template_POST`
- Upsert a letter template (create or update by category + templateKey). Admin-only.

### `endpoints/admin/letter-template/delete_POST`
- Delete a letter template by id. Admin-only.

### `endpoints/admin/letter-template/seed_POST`
- Seed all default templates into the DB from the current hardcoded values, so admins can see and edit them. Only creates rows that don't already exist. Admin-only.

### `pages/admin-letter-templates`
- Admin page listing all templates in a tabbed view (Bureau / Provincial / Violation Narrative tabs).
- Each template row shows: label, category, last updated, active status.
- Click to expand/edit inline: shows each section field as a textarea with the current value (from DB, or grayed-out default if no override).
- Toggle for "Full body override" mode that shows a single large textarea replacing all section fields.
- Save button persists to DB. Reset button clears DB override (reverts to hardcoded default).
- A "Seed Defaults" button at the top that calls the seed endpoint to populate all templates with their current hardcoded values.

## Files to Modify

### `helpers/packetLetterBuilder`
- After building `letterContent` from hardcoded logic, call `resolveTemplateOverrides('bureau', key)` and merge any non-null DB fields onto the `LetterContent` object.
- If `full_body_override` is set, parse it into the appropriate `LetterContent` fields (or use it as the full `disputedItems` + other sections).

### `helpers/equifaxDisputeTemplate`
- After `buildEquifaxDisputeLetter` constructs the letter, apply bureau-level overrides from `resolveTemplateOverrides('bureau', 'equifax')`.

### `helpers/transunionDisputeTemplate`
- After `buildTransUnionDispute` constructs the letter, apply bureau-level overrides from `resolveTemplateOverrides('bureau', 'transunion')`.

### `helpers/disputeNarrativeBuilder`
- In `getDisputeLetterFraming`: check DB for violation_narrative overrides before returning hardcoded framing.
- In `buildBureauRequestedAction` (in equifaxDisputeTemplate): check DB for violation_narrative `requested_action` override.

### `helpers/packetTemplatesCRA`, `packetTemplatesCPA`, `packetTemplatesCPBPA`, `packetTemplatesOther`
- Each provincial template function: after building `LetterContent`, apply provincial overrides from `resolveTemplateOverrides('provincial', key)`.

### `endpoints/packet/build_POST`
- No direct changes needed — the template helpers themselves will handle DB lookups internally.

### `components/AppSidebarNavigation`
- Add "Letter Templates" link under the admin section of the sidebar.

## Approach

1. **Create DB table** `letter_template` with the schema above.
2. **Create `helpers/letterTemplateQueries`** with CRUD + resolve functions.
3. **Create admin endpoints** (list, upsert, delete, seed).
4. **Create admin UI page** `pages/admin-letter-templates` with tabbed template editor.
5. **Modify template helpers** to check DB overrides:
   - Add an `applyTemplateOverrides(letterContent, category, templateKey)` utility in `letterTemplateQueries` that fetches DB overrides and merges non-null fields onto the LetterContent.
   - Call this at the end of each template function (bureau, provincial, violation narrative).
6. **Add sidebar link** for admin navigation.
7. **Create seed endpoint** that extracts current hardcoded values and inserts them as the initial DB rows.

## Risks & Considerations

- **Performance**: Each letter generation will now make 1-2 DB queries for template overrides. This is acceptable since packet generation is already DB-heavy and not latency-critical.
- **Backward compatibility**: All existing hardcoded templates remain as fallbacks. If no DB row exists or `is_active` is false, the system behaves exactly as before.
- **Full body override**: When `full_body_override` is set, individual section fields are ignored. The UI should make this clear with a visual toggle.
- **Template variables**: The section overrides are plain text — they don't support dynamic variables like `{{consumerName}}`. This keeps things simple. If variable interpolation is needed later, it can be added as a follow-up.
- **Violation narrative overrides**: These affect ALL letters (bureau-specific and provincial) since `getDisputeLetterFraming` and `buildBureauRequestedAction` are shared across all code paths.
- **Seeding**: The seed endpoint should be idempotent — only insert rows that don't already exist, never overwrite admin edits.
- **Mobile app backward compatibility**: No endpoint changes to existing endpoints, only new admin-only endpoints added. Safe for mobile.
