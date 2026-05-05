const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function assertSafeLocalDatabaseUrl(env: NodeJS.ProcessEnv): string {
  if (env.CRP_LOCAL_DEV !== "true") {
    throw new Error("Refusing DB tests unless CRP_LOCAL_DEV=true.");
  }

  const rawUrl = env.FLOOT_DATABASE_URL;
  if (!rawUrl) {
    throw new Error("FLOOT_DATABASE_URL is not set.");
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("FLOOT_DATABASE_URL is not a valid URL.");
  }

  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(`Refusing DB tests against non-local database host: ${parsed.hostname}`);
  }

  const expectedDatabase = env.LOCAL_DATABASE_NAME?.trim();
  const actualDatabase = parsed.pathname.replace(/^\//, "");
  if (expectedDatabase && actualDatabase !== expectedDatabase) {
    throw new Error(`Refusing DB tests against ${actualDatabase}; expected ${expectedDatabase}.`);
  }

  return parsed.toString();
}
