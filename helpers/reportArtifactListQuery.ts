import { sql } from "kysely";

const LOCAL_STORAGE_PREFIX = "local:";
const REPORT_ARTIFACT_LOCAL_STORAGE_LIKE_PATTERN = `${LOCAL_STORAGE_PREFIX}report-artifacts/%`;

export function reportArtifactFileNameSelection() {
  return sql<string | null>`${sql.ref("reportArtifact.data")} ->> 'fileName'`.as("fileName");
}

export function reportArtifactStorageReferenceSelections() {
  return [
    sql<boolean>`${sql.ref("reportArtifact.storageUrl")} is not null`.as("hasStorageReference"),
    sql<string | null>`
      case
        when ${sql.ref("reportArtifact.storageUrl")} like ${REPORT_ARTIFACT_LOCAL_STORAGE_LIKE_PATTERN}
        then substring(${sql.ref("reportArtifact.storageUrl")} from ${LOCAL_STORAGE_PREFIX.length + 1})
        else null
      end
    `.as("storageObjectName"),
  ] as const;
}
