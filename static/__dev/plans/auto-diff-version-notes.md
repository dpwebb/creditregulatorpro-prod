---
created: 2026-04-20T01:31:26.215Z
updated: 2026-04-20T01:31:26.215Z
---

# Auto-Diff Version Notes

## Problem
The version note generator only looks at audit_log entries for a narrow set of entity types (TRACKED_ENTITY_TYPES). Many platform changes — new entities, config changes, feature flag toggles, new obligations, scanning rules — are not captured in audit logs but DO exist in the database. The current snapshot stores only aggregate counts (some hardcoded), making it impossible to detect what specifically changed.

## Solution: Snapshot Diff Engine
No manual entries. Capture **detailed** entity lists in each version snapshot (not just counts), then diff the current state against the last released snapshot when generating notes.

## Pages
No new pages needed. The existing admin version management page already displays generated notes.

## User accounts
No changes — admin-only feature.

## Look & feel
No visual changes. Backend improvements only.

## What it remembers
Enhanced `system_snapshot` JSON column on `software_version` table now stores detailed entity inventories:
- **Statutes**: list of `{ id, name, jurisdiction }`
- **Obligations**: list of `{ id, name, category, bureauId }`
- **Feature Flags**: list of `{ id, key, enabled }`
- **Bureaus**: list of `{ id, name }`
- **Enforcement Mechanisms**: list of `{ id, name }`
- **System Settings**: list of `{ id, key, value }`
- **Scanning Rules**: list of `{ id, name, category, enabled }`
- **Regulatory Updates**: list of `{ id, title, status }`
- Aggregate counts kept for users, tradelines, packets, tables, creditor validations, licensed agencies

## How it works

### 1. Enhanced Snapshot (`version/snapshot_POST`)
Replace hardcoded counts with actual entity inventories queried from the database. When admin takes a snapshot before release, the full state is captured.

### 2. New Helper: `versionSnapshotDiff`
- Takes the last released version's `system_snapshot` and queries the current DB state to build a "current snapshot"
- Produces structured diff per entity type: `{ added: string[], removed: string[], changed: string[] }`
- "Changed" means entity exists in both snapshots but a key property differs (e.g., feature flag toggled on/off, obligation renamed)
- Returns the diff plus summary stats (total additions, removals, changes)

### 3. Update `version/generate-notes_POST`
- After fetching audit logs, also call the snapshot diff engine
- Include BOTH audit log summaries AND entity diffs in the Gemini prompt
- Enhanced prompt categories:
  - "System Changes" — audit-log-based system operations
  - "Bureau Changes" — bureau additions/removals/changes
  - "Compliance & Regulatory" — statute, obligation, enforcement mechanism, regulatory update changes
  - "Platform Configuration" — feature flag changes, system setting changes
  - "Rules & Scanning" — scanning rule additions/removals/changes
  - "Furnisher & Validation" — furnisher-related changes from audit log
- AI merges audit log context with diff context for comprehensive release notes

### 4. Update `version/change-summary_GET`
- Also run the snapshot diff and include diff-based changes in the summary
- Diff-detected: additions → MINOR level, removals → MAJOR level, property changes → PATCH level
- Merge with existing audit-log-based changes for total operation count and suggested version

## Outside services
No new services — uses existing Gemini API for AI note generation.