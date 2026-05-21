import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const DEFAULT_REVIEWED_MIGRATION_BASE_TABLES = [
  "public.users",
  "public.report_artifact",
  "public.packet",
  "public.creditor_obligation_test",
  "public.tradeline",
  "public.bureau",
  "public.pass_extraction",
  "public.evidence_event",
  "public.evidence_attachment",
  "public.licensed_collection_agency",
];

const FORBIDDEN_REVIEWED_MIGRATION_PATTERNS = [
  { name: "drop", regex: /\bdrop\b/i },
  { name: "delete", regex: /\bdelete\s+from\b/i },
  { name: "truncate", regex: /\btruncate\b/i },
  { name: "update", regex: /\bupdate\s+[a-z0-9_."]+/i },
  { name: "insert", regex: /\binsert\s+into\b/i },
];

function normalizeRelativePath(value) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function repoPath(rootDir, relativePath) {
  return path.join(rootDir, ...normalizeRelativePath(relativePath).split("/").filter(Boolean));
}

function normalizeIdentifier(value) {
  return String(value ?? "").replace(/"/g, "").toLowerCase();
}

function normalizeQualifiedName(schemaName, tableName) {
  return `${normalizeIdentifier(schemaName)}.${normalizeIdentifier(tableName)}`;
}

export function splitReviewedMigrationStatements(sqlText) {
  return String(sqlText ?? "")
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function assertNonDestructiveStatement(statement) {
  for (const pattern of FORBIDDEN_REVIEWED_MIGRATION_PATTERNS) {
    if (pattern.regex.test(statement)) {
      throw new Error(`Reviewed migration contains forbidden ${pattern.name} statement.`);
    }
  }
}

function referencedTables(statement) {
  return [...statement.matchAll(/\breferences\s+("?[\w]+"?)\s*\.\s*("?[\w]+"?)/gi)].map((match) =>
    normalizeQualifiedName(match[1], match[2]),
  );
}

export function simulateReviewedMigrationFreshDatabase({
  rootDir = process.cwd(),
  migrationPath,
  baseTables = DEFAULT_REVIEWED_MIGRATION_BASE_TABLES,
} = {}) {
  if (!migrationPath) throw new Error("migrationPath is required.");
  const normalizedMigrationPath = normalizeRelativePath(migrationPath);
  const absolutePath = repoPath(rootDir, normalizedMigrationPath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Reviewed migration not found: ${normalizedMigrationPath}`);
  }

  const sqlText = readFileSync(absolutePath, "utf8");
  const statements = splitReviewedMigrationStatements(sqlText);
  const tables = new Set(baseTables.map((table) => normalizeIdentifier(table)));
  const indexes = new Set();

  for (const statement of statements) {
    assertNonDestructiveStatement(statement);

    const createTable = statement.match(/^\s*create\s+table\s+if\s+not\s+exists\s+("?[\w]+"?)\s*\.\s*("?[\w]+"?)\s*\(/i);
    if (createTable) {
      for (const reference of referencedTables(statement)) {
        if (!tables.has(reference)) {
          throw new Error(`Reviewed migration references missing table ${reference}.`);
        }
      }
      tables.add(normalizeQualifiedName(createTable[1], createTable[2]));
      continue;
    }

    const createIndex = statement.match(
      /^\s*create\s+(?:unique\s+)?index\s+if\s+not\s+exists\s+("?[\w]+"?)\s+on\s+("?[\w]+"?)\s*\.\s*("?[\w]+"?)/i,
    );
    if (createIndex) {
      const targetTable = normalizeQualifiedName(createIndex[2], createIndex[3]);
      if (!tables.has(targetTable)) {
        throw new Error(`Reviewed migration creates index on missing table ${targetTable}.`);
      }
      indexes.add(normalizeIdentifier(createIndex[1]));
      continue;
    }

    throw new Error(`Reviewed migration contains unsupported statement: ${statement.slice(0, 120)}`);
  }

  return {
    ok: true,
    migrationPath: normalizedMigrationPath,
    statementCount: statements.length,
    tableCount: tables.size,
    indexCount: indexes.size,
    createdTables: [...tables].filter((table) => !baseTables.map((base) => normalizeIdentifier(base)).includes(table)).sort(),
    createdIndexes: [...indexes].sort(),
    destructiveStatementDetected: false,
  };
}
