import { sql } from "kysely";

export function reportArtifactFileNameSelection() {
  return sql<string | null>`${sql.ref("reportArtifact.data")} ->> 'fileName'`.as("fileName");
}
