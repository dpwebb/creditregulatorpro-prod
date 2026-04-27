import { sql } from "kysely";
import { db } from "./db";

export interface DetailedSnapshot {
  statutes: { id: number; name: string; jurisdiction: string }[];
  obligations: {
    id: number;
    name: string;
    section: string;
    obligationType: string | null;
  }[];
  featureFlags: { id: number; key: string; enabled: boolean }[];
  bureaus: { id: number; name: string }[];
  enforcementMechanisms: { id: number; name: string }[];
  systemSettings: { key: string; value: string }[];
  scanningRules: {
    id: number;
    title: string;
    status: string;
    violationCategory: string;
  }[];
  regulatoryUpdates: { id: number; title: string; status: string }[];
  counts: {
    usersCount: number;
    tradelinesCount: number;
    packetsCount: number;
    tablesCount: number;
    creditorValidationsCount: number;
    licensedAgenciesCount: number;
  };
}

export type SnapshotDiffResult = {
  entityDiffs: Record<
    string,
    { added: string[]; removed: string[]; changed: string[] }
  >;
  summary: {
    totalAdded: number;
    totalRemoved: number;
    totalChanged: number;
  };
};

/**
 * Helper to safely extract a numeric count from a kysely aggregate result.
 */
const extractCount = (row: any): number => {
  if (!row || row.count == null) return 0;
  return Number(row.count);
};

/**
 * Truncates a string to a specified length, adding an ellipsis if necessary.
 */
const truncate = (str: string, length: number): string => {
  if (!str) return "";
  if (str.length <= length) return str;
  return str.substring(0, length - 3) + "...";
};

/**
 * Builds a detailed snapshot of the current system state, capturing key configurations
 * and aggregated metrics for historical tracking and version comparisons.
 */
export async function buildCurrentSnapshot(): Promise<DetailedSnapshot> {
  const [
    statutes,
    obligations,
    featureFlags,
    bureaus,
    enforcementMechanisms,
    systemSettings,
    scanningRules,
    regulatoryUpdates,
    usersRes,
    tradelinesRes,
    packetsRes,
    validationsRes,
    agenciesRes,
    tablesRes,
  ] = await Promise.all([
    db
      .selectFrom("statute")
      .select(["id", "code", "jurisdiction"])
      .execute()
      .then((rows) =>
        rows.map((r) => ({
          id: r.id as number,
          name: r.code,
          jurisdiction: r.jurisdiction,
        }))
      ),

    db
      .selectFrom("obligation")
      .select(["id", "description", "section", "obligationType"])
      .execute()
      .then((rows) =>
        rows.map((r) => ({
          id: r.id as number,
          name: truncate(r.description, 80),
          section: r.section,
          obligationType: r.obligationType,
        }))
      ),

    db
      .selectFrom("featureFlag")
      .select(["id", "key", "enabled"])
      .execute()
      .then((rows) =>
        rows.map((r) => ({
          id: r.id as number,
          key: r.key,
          enabled: r.enabled as boolean,
        }))
      ),

    db
      .selectFrom("bureau")
      .select(["id", "name"])
      .execute()
      .then((rows) =>
        rows.map((r) => ({ id: r.id as number, name: r.name }))
      ),

    db
      .selectFrom("enforcementMechanism")
      .select(["id", "name"])
      .execute()
      .then((rows) =>
        rows.map((r) => ({ id: r.id as number, name: r.name }))
      ),

    db
      .selectFrom("systemSettings")
      .select(["key", "value"])
      .execute()
      .then((rows) => rows.map((r) => ({ key: r.key, value: r.value }))),

    db
      .selectFrom("dynamicScanningRule")
      .select(["id", "title", "status", "violationCategory"])
      .execute()
      .then((rows) =>
        rows.map((r) => ({
          id: r.id as number,
          title: r.title,
          status: r.status,
          violationCategory: r.violationCategory,
        }))
      ),

    db
      .selectFrom("regulatoryUpdateLog")
      .select(["id", "title", "status"])
      .execute()
      .then((rows) =>
        rows.map((r) => ({
          id: r.id as number,
          title: r.title,
          status: r.status,
        }))
      ),

    db
      .selectFrom("users")
      .select((eb) => eb.fn.count<number>("id").as("count"))
      .executeTakeFirst(),

    db
      .selectFrom("tradeline")
      .select((eb) => eb.fn.count<number>("id").as("count"))
      .executeTakeFirst(),

    db
      .selectFrom("packet")
      .select((eb) => eb.fn.count<number>("id").as("count"))
      .executeTakeFirst(),

    db
      .selectFrom("creditorValidationRequirement")
      .select((eb) => eb.fn.count<number>("id").as("count"))
      .executeTakeFirst(),

    db
      .selectFrom("licensedCollectionAgency")
      .select((eb) => eb.fn.count<number>("id").as("count"))
      .executeTakeFirst(),

    sql<{
      count: number;
    }>`SELECT count(*) as count FROM information_schema.tables WHERE table_schema = 'public'`.execute(
      db
    ),
  ]);

  return {
    statutes,
    obligations,
    featureFlags,
    bureaus,
    enforcementMechanisms,
    systemSettings,
    scanningRules,
    regulatoryUpdates,
    counts: {
      usersCount: extractCount(usersRes),
      tradelinesCount: extractCount(tradelinesRes),
      packetsCount: extractCount(packetsRes),
      creditorValidationsCount: extractCount(validationsRes),
      licensedAgenciesCount: extractCount(agenciesRes),
      tablesCount: extractCount(tablesRes.rows[0]),
    },
  };
}

/**
 * Computes a difference object detailing what was added, removed, or changed
 * between two distinct system snapshots.
 */
export function computeSnapshotDiff(
  previousSnapshot: any | null,
  currentSnapshot: DetailedSnapshot
): SnapshotDiffResult {
  const result: SnapshotDiffResult = {
    entityDiffs: {},
    summary: { totalAdded: 0, totalRemoved: 0, totalChanged: 0 },
  };

  // Helper to detect if a snapshot is in the legacy format (missing arrays)
  const isLegacyOrNull =
    !previousSnapshot || !Array.isArray(previousSnapshot.statutes);

  // Generic diff computation for ID-based entities
  const computeEntityListDiff = <T extends Record<string, any>>(
    entityName: string,
    prevList: T[],
    currList: T[],
    identifierKey: keyof T,
    displayKey: keyof T
  ) => {
    const diff = { added: [] as string[], removed: [] as string[], changed: [] as string[] };
    const prevMap = new Map(prevList.map((item) => [item[identifierKey], item]));
    const currMap = new Map(currList.map((item) => [item[identifierKey], item]));

    for (const [id, currItem] of currMap.entries()) {
      const prevItem = prevMap.get(id);
      if (!prevItem) {
        diff.added.push(String(currItem[displayKey]));
        result.summary.totalAdded++;
      } else {
        // Find property changes
        const changes: string[] = [];
        for (const prop of Object.keys(currItem)) {
          if (currItem[prop] !== prevItem[prop]) {
            changes.push(`${prop} from '${prevItem[prop]}' to '${currItem[prop]}'`);
          }
        }
        if (changes.length > 0) {
          diff.changed.push(`${currItem[displayKey]}: ${changes.join(", ")}`);
          result.summary.totalChanged++;
        }
      }
    }

    for (const [id, prevItem] of prevMap.entries()) {
      if (!currMap.has(id)) {
        diff.removed.push(String(prevItem[displayKey]));
        result.summary.totalRemoved++;
      }
    }

    result.entityDiffs[entityName] = diff;
  };

  if (isLegacyOrNull) {
    // Treat everything as added
    const fakePrev: DetailedSnapshot = {
      statutes: [], obligations: [], featureFlags: [], bureaus: [],
      enforcementMechanisms: [], systemSettings: [], scanningRules: [],
      regulatoryUpdates: [], counts: { usersCount: 0, tradelinesCount: 0, packetsCount: 0, tablesCount: 0, creditorValidationsCount: 0, licensedAgenciesCount: 0 }
    };
    previousSnapshot = fakePrev;
  }

  const prev = previousSnapshot as DetailedSnapshot;
  const curr = currentSnapshot;

  computeEntityListDiff("statutes", prev.statutes, curr.statutes, "id", "name");
  computeEntityListDiff("obligations", prev.obligations, curr.obligations, "id", "name");
  computeEntityListDiff("featureFlags", prev.featureFlags, curr.featureFlags, "id", "key");
  computeEntityListDiff("bureaus", prev.bureaus, curr.bureaus, "id", "name");
  computeEntityListDiff("enforcementMechanisms", prev.enforcementMechanisms, curr.enforcementMechanisms, "id", "name");
  computeEntityListDiff("scanningRules", prev.scanningRules, curr.scanningRules, "id", "title");
  computeEntityListDiff("regulatoryUpdates", prev.regulatoryUpdates, curr.regulatoryUpdates, "id", "title");
  
  // System settings uses 'key' as identifier
  computeEntityListDiff("systemSettings", prev.systemSettings, curr.systemSettings, "key", "key");

  // Diff Counts
  const countDiff = { added: [] as string[], removed: [] as string[], changed: [] as string[] };
  const countKeys = Object.keys(curr.counts) as Array<keyof typeof curr.counts>;
  
  for (const key of countKeys) {
    const prevVal = prev.counts?.[key] || 0;
    const currVal = curr.counts[key];
    if (prevVal !== currVal) {
      const direction = currVal > prevVal ? "increased" : "decreased";
      countDiff.changed.push(`${key} ${direction} from ${prevVal} to ${currVal}`);
      result.summary.totalChanged++;
    }
  }
  result.entityDiffs["aggregateCounts"] = countDiff;

  return result;
}