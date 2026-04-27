---
created: 2026-04-07T05:11:47.889Z
updated: 2026-04-07T05:11:47.889Z
---

# Enhance Change Detection, Cross-Referencing & Packet Linkage

## Summary
Three-pronged enhancement to the change detection pipeline, cross-referencing system, and packet-to-change linkage. Currently the system has functional but loosely-coupled mechanisms: drift detection compares raw artifact JSON blobs (not actual tradeline fields), packets have no direct link to the changes that prompted them, and there's no automatic "what changed after we sent this packet?" analysis.

---

## 1. Strengthen Drift Detection Logic

### Problem
- `tradeline/detect-changes_POST` casts `report_artifact.data` as `StandardizedCreditData`, but the actual stored data is extraction metadata (`extractionStatus`, `docstrangeRawHtml`, `tradelineIds`), not standardized credit fields
- Drift detection is manual-only (user clicks "Run Analysis")
- Limited to 4 financial fields, 4 date fields, status, and remarks — misses payment pattern, MOP, responsibility code, creditor name, and credit limit changes
- No field-level snapshot captured at ingestion time, making accurate before/after comparison unreliable

### Solution

#### A. New `tradeline_snapshot` table
Captures a point-in-time snapshot of key tradeline fields each time a report is ingested. This is the single source of truth for before/after comparisons.

```
tradeline_snapshot (
  id                    SERIAL PRIMARY KEY,
  tradeline_id          INTEGER NOT NULL REFERENCES tradeline(id),
  report_artifact_id    INTEGER REFERENCES report_artifact(id),
  snapshot_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Snapshotted fields
  account_number        TEXT,
  creditor_name         TEXT,
  account_type          TEXT,
  status                TEXT,
  balance               NUMERIC,
  current_balance       NUMERIC,
  amount_past_due       NUMERIC,
  high_credit           NUMERIC,
  credit_limit          NUMERIC,
  opened_date           TIMESTAMPTZ,
  date_closed           TIMESTAMPTZ,
  date_of_first_delinquency TIMESTAMPTZ,
  date_of_last_payment  TIMESTAMPTZ,
  last_activity_date    TIMESTAMPTZ,
  last_reported_date    TIMESTAMPTZ,
  payment_pattern       TEXT,
  mop                   TEXT,
  responsibility_code   TEXT,
  ecoa_code             TEXT,
  terms                 TEXT,
  is_collection_account BOOLEAN DEFAULT FALSE,
  original_creditor_name TEXT,
  collection_agency_name TEXT
)
```
**Indexes:** `(tradeline_id, snapshot_at DESC)`, `(report_artifact_id)`

#### B. Rewrite `changeDetector.detectChanges()` 
Compare `TradelineSnapshot` objects instead of raw JSON blobs. Expand detection to cover:
- **Financial** (existing): balance, amountPastDue, highCredit, creditLimit + NEW: currentBalance
- **Temporal** (existing): dateOpened, dateClosed, DOFD, lastPayment + NEW: lastActivityDate, lastReportedDate
- **Status** (existing): accountStatus + NEW: MOP code changes, responsibility code changes
- **Identity** (NEW): creditorName changes, accountNumber changes, accountType changes
- **Payment** (NEW): paymentPattern string diff (e.g., "111111" → "111211"), ECOA code changes
- **Collection** (NEW): isCollectionAccount flag flips, collectionAgencyName changes, originalCreditorName changes

#### C. Auto-trigger drift detection during ingestion
In `ingestReportHandler.handleIngestProcess()`, after `persistTradelines()`:
1. Create snapshots for each persisted tradeline
2. For tradelines that were UPDATED (not new), auto-run the new drift comparison between the previous snapshot and the new one
3. Log results to `obligation_challenge_log` automatically
4. Auto-escalate obligation instances when significant drift is found (existing logic, but now triggered during ingestion)

#### D. Update `tradeline/detect-changes_POST`
Refactor to use `tradeline_snapshot` table instead of `report_artifact.data`. Compare the latest two snapshots for a tradeline.

### Files to Modify
- `helpers/changeDetector.tsx` — Rewrite to compare `TradelineSnapshot` objects, add new change categories
- `helpers/ingestTradelinePersistence.tsx` — After persist, create a snapshot record
- `helpers/ingestReportHandler.tsx` — After snapshot creation, auto-run drift detection for updated tradelines
- `endpoints/tradeline/detect-changes_POST.ts` — Refactor to query snapshots instead of artifacts

### Files to Create
- `helpers/tradelineSnapshotManager.tsx` — Creates snapshots, fetches latest pair for comparison, runs auto-drift-detection

---

## 2. Improve Cross-Referencing Between Changes & Packets

### Problem
- `obligation_challenge_log` records drift entries with `tradelineId` and `reportArtifactId` but no `packetId`
- Packets know their `tradelineId` but not which specific drift/violation prompted them
- Evidence events record PACKET_GENERATED but don't reference the challenge logs that led to generation
- No way to answer: "Which changes led to this packet being generated?" or "Which packets were sent in response to this drift?"

### Solution

#### A. Add `packet_id` column to `obligation_challenge_log`
```sql
ALTER TABLE obligation_challenge_log ADD COLUMN packet_id INTEGER REFERENCES packet(id);
```
When a packet is built via `packet/build_POST`, link the packet to all unresolved challenge logs for that tradeline.

#### B. Add `source_snapshot_id` to `obligation_challenge_log`
```sql
ALTER TABLE obligation_challenge_log ADD COLUMN source_snapshot_id INTEGER REFERENCES tradeline_snapshot(id);
ALTER TABLE obligation_challenge_log ADD COLUMN comparison_snapshot_id INTEGER REFERENCES tradeline_snapshot(id);
```
This links each drift entry to the exact before/after snapshots that produced it.

#### C. Add `baseline_snapshot_id` to `packet`
```sql
ALTER TABLE packet ADD COLUMN baseline_snapshot_id INTEGER REFERENCES tradeline_snapshot(id);
```
Records which snapshot the packet was generated against. When a new report arrives, we can compare the baseline snapshot to the new snapshot to measure packet impact.

#### D. Auto-link packets to challenge logs
In `packet/build_POST`, after creating the packet:
1. Find all `obligation_challenge_log` entries for the tradeline that have no `packet_id`
2. Update them with the new packet's ID
3. This creates a direct lineage: Drift → Challenge Log → Packet

#### E. New evidence event types
- `DRIFT_DETECTED_POST_DISPUTE` — When drift is detected on a tradeline that has an outstanding packet
- `PACKET_IMPACT_ASSESSED` — When a new report shows changes to a disputed tradeline

### Files to Modify
- `endpoints/packet/build_POST.ts` — After packet creation, link to challenge logs and set baseline_snapshot_id
- `endpoints/tradeline/detect-changes_POST.ts` — Store snapshot IDs on challenge log entries
- `helpers/silentCorrectionDetector.tsx` — When detecting silent corrections, reference the packet(s) that preceded the correction

### Files to Create
- None new — modifications to existing files

---

## 3. Granular Packet-to-Change Linkage (Packet Impact Analysis)

### Problem
- No mechanism to answer: "After we sent packet #36, what changed in the next report?"
- No "response effectiveness" tracking per packet
- The `successMetric` table records outcomes but doesn't show WHICH fields changed
- Silent correction detector compares pre/post but doesn't produce per-field diffs linked to packets

### Solution

#### A. New `packet_impact_assessment` table
```
packet_impact_assessment (
  id                     SERIAL PRIMARY KEY,
  packet_id              INTEGER NOT NULL REFERENCES packet(id),
  tradeline_id           INTEGER NOT NULL REFERENCES tradeline(id),
  baseline_snapshot_id   INTEGER NOT NULL REFERENCES tradeline_snapshot(id),
  followup_snapshot_id   INTEGER NOT NULL REFERENCES tradeline_snapshot(id),
  
  -- Assessment results
  total_fields_changed   INTEGER NOT NULL DEFAULT 0,
  favorable_changes      INTEGER NOT NULL DEFAULT 0,
  unfavorable_changes    INTEGER NOT NULL DEFAULT 0,
  neutral_changes        INTEGER NOT NULL DEFAULT 0,
  
  field_diffs            JSONB NOT NULL DEFAULT '[]',
  -- Each entry: { fieldName, oldValue, newValue, changeType, isFavorable, driftAmount }
  
  impact_score           NUMERIC,  -- -100 to +100, positive = favorable
  assessment_type        TEXT NOT NULL, -- 'AUTO' or 'MANUAL'
  assessed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes                  TEXT
)
```
**Indexes:** `(packet_id)`, `(tradeline_id, assessed_at DESC)`

#### B. Auto-assess packet impact during ingestion
In `ingestReportHandler`, after the silent correction detection step:
1. For each updated tradeline, check if there are packets with `baseline_snapshot_id` that haven't been assessed yet
2. Compare the packet's baseline snapshot to the new snapshot
3. Classify each field change as favorable/unfavorable/neutral
4. Create a `packet_impact_assessment` record
5. If favorable changes detected, create a `PACKET_IMPACT_ASSESSED` evidence event

#### C. New endpoint: `packet/impact_GET`
Returns the impact assessment for a specific packet, showing:
- Before/after field comparisons
- Which disputed items were corrected
- Impact score
- Timeline of packets → changes → outcomes

#### D. New endpoint: `tradeline/change-timeline_GET`
Returns a unified timeline for a tradeline:
- Snapshots (report uploads)
- Packets sent
- Changes detected (drift logs)
- Impact assessments
- Silent corrections
- Obligation state transitions

Ordered chronologically, cross-referenced by IDs.

#### E. UI: Packet Impact View
On the tradeline detail page (`tradelines.$id`), add a "Packet Impact" tab/section showing:
- For each packet: what the disputed fields were vs what changed in the follow-up report
- Color-coded: green for favorable corrections, red for unfavorable changes, gray for no change
- Aggregate impact score per packet

#### F. UI: Enhanced Change Detection Dashboard
Update `pages/change-detection` to:
- Show linked packet IDs next to drift entries
- Add a "Packet Impact" column showing whether the drift was favorable relative to the dispute
- Filter by "Post-Dispute Changes" to see only changes that occurred after a packet was sent

### Files to Create
- `helpers/packetImpactAssessor.tsx` — Core logic for comparing baseline vs followup snapshots and classifying changes
- `helpers/packetImpactQueries.tsx` — React Query hooks for fetching impact data
- `endpoints/packet/impact_GET.ts` + schema — Returns impact assessment for a packet
- `endpoints/tradeline/change-timeline_GET.ts` + schema — Returns unified timeline
- `components/PacketImpactView.tsx` — Visual component for packet impact analysis

### Files to Modify
- `helpers/ingestReportHandler.tsx` — Add auto-impact-assessment step after silent correction detection
- `pages/tradelines.$id.tsx` — Add Packet Impact tab using the new component
- `pages/change-detection.tsx` — Add packet linkage columns and post-dispute filter
- `components/TradelineDriftPanel.tsx` — Show linked packet info on drift entries

---

## Approach (Implementation Order)

### Phase 1: Foundation (Schema + Snapshots)
1. Create `tradeline_snapshot` table
2. Add columns to `obligation_challenge_log` (`packet_id`, `source_snapshot_id`, `comparison_snapshot_id`)
3. Add `baseline_snapshot_id` to `packet` table
4. Create `packet_impact_assessment` table
5. Create `helpers/tradelineSnapshotManager.tsx`
6. Pull updated schema

### Phase 2: Core Logic
7. Rewrite `helpers/changeDetector.tsx` to use snapshots and expanded field set
8. Update `helpers/ingestTradelinePersistence.tsx` to create snapshots on persist
9. Create `helpers/packetImpactAssessor.tsx`
10. Update `helpers/ingestReportHandler.tsx` to auto-trigger drift detection and impact assessment

### Phase 3: Endpoints
11. Refactor `endpoints/tradeline/detect-changes_POST.ts` to use snapshots
12. Update `endpoints/packet/build_POST.ts` to link challenge logs and set baseline snapshot
13. Create `endpoints/packet/impact_GET.ts`
14. Create `endpoints/tradeline/change-timeline_GET.ts`

### Phase 4: Frontend
15. Create `helpers/packetImpactQueries.tsx`
16. Create `components/PacketImpactView.tsx`
17. Update `pages/tradelines.$id.tsx` to add impact tab
18. Update `pages/change-detection.tsx` with packet linkage
19. Update `components/TradelineDriftPanel.tsx` with packet info

---

## Risks & Considerations

1. **Backward Compatibility (Mobile App)**: All schema changes are additive (new tables, new nullable columns). No existing endpoint signatures change. New endpoints are purely additive. ✅ Safe.

2. **Data Migration**: Existing tradelines won't have snapshots. On first run after deploy, the system should create an initial snapshot from current tradeline state. The `tradelineSnapshotManager` should handle this gracefully.

3. **Performance**: Snapshot creation adds one INSERT per tradeline per upload. For reports with 4 tradelines, that's 4 extra inserts — negligible. The `tradeline_snapshot` table should be indexed properly.

4. **Storage**: Snapshots are denormalized copies of ~25 fields per tradeline per report. At typical usage (monthly uploads, 4-10 tradelines), this is minimal.

5. **Existing Drift Logs**: Existing `obligation_challenge_log` entries won't have `packet_id` or snapshot references. The UI should handle nulls gracefully (show "N/A" or "Pre-enhancement").

6. **Silent Correction Detector**: The existing detector uses in-memory snapshots during ingestion. We should migrate it to use the new `tradeline_snapshot` table for consistency, but keep backward compatibility during the transition.

7. **Serverless Timeout**: The ingestion pipeline already has many steps. Adding snapshot creation + auto-drift-detection + impact assessment adds latency. These should be lightweight (simple INSERTs and comparisons) and shouldn't approach the 3-minute timeout.
