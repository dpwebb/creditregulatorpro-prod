# Kysely CamelCasePlugin Number Column Bug

The project uses `CamelCasePlugin({underscoreBetweenUppercaseLetters: true})` in `helpers/db.tsx`.

**Problem:** Column names containing numbers lose underscores during round-trip conversion:
- DB column: `times_30_days_late` → Schema (camelCase): `times30DaysLate` → Kysely INSERT (snake_case): `times30_days_late` ≠ original

**Root cause:** The CamelCasePlugin only inserts underscores before uppercase letters, not before digits.

**Affected tables:** `tradeline_payment_history` columns: `times_30_days_late`, `times_60_days_late`, `times_90_days_late`, `times_120_days_late`

**Fix pattern:** In `comprehensiveReportStorage.tsx`, these 4 columns are excluded from the Kysely ORM insert and set via a raw `sql` UPDATE after the insert.

**Prevention:** Avoid creating DB columns with numbers in snake_case segments. If unavoidable, use raw SQL for those columns.