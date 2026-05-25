import { describe, expect, it } from "vitest";
import { CamelCasePlugin, Kysely } from "kysely";
import { PostgresJSDialect } from "kysely-postgres-js";
import postgres from "postgres";

import { reportArtifactFileNameSelection } from "../../helpers/reportArtifactListQuery";

describe("report artifact list query helpers", () => {
  it("compiles the file-name JSON selection with the physical report_artifact alias", async () => {
    const db = new Kysely<Record<string, unknown>>({
      plugins: [new CamelCasePlugin({ underscoreBetweenUppercaseLetters: true })],
      dialect: new PostgresJSDialect({
        postgres: postgres("postgres://user:pass@localhost:5432/creditregulatorpro_test", {
          prepare: false,
        }),
      }),
    });

    try {
      const compiled = db
        .selectFrom("reportArtifact")
        .select(["reportArtifact.id", reportArtifactFileNameSelection()])
        .compile();

      expect(compiled.sql).toContain('"report_artifact"."data" ->> \'fileName\'');
      expect(compiled.sql).not.toContain('"reportArtifact"."data"');
    } finally {
      await db.destroy();
    }
  });
});
