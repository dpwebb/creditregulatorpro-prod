import "../loadEnv.js";

import { db } from "../helpers/db";
import { seedLetterTemplateDefaults } from "../helpers/seedLetterTemplateDefaults";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function assertLocalDatabase() {
  const databaseUrl = process.env.FLOOT_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("FLOOT_DATABASE_URL is required.");
  }
  const url = new URL(databaseUrl);
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`Refusing to prepopulate non-local database host: ${url.hostname}`);
  }
  if (process.env.CRP_LOCAL_DEV !== "true") {
    throw new Error("Refusing to prepopulate local templates unless CRP_LOCAL_DEV=true.");
  }
}

async function main() {
  assertLocalDatabase();
  const result = await seedLetterTemplateDefaults(null);
  console.log(
    `Letter template defaults complete: ${result.seeded} inserted, ${result.updated} updated, ${result.total} expected.`
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
