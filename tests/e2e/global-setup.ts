import { execFileSync } from "node:child_process";
import { E2E_BASE_URL } from "./e2eAuth";
import { isLocalhostUrl } from "../../scripts/localAdminAuth";

const LOOPBACK_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isLoopbackDatabaseUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return LOOPBACK_DATABASE_HOSTS.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

export function buildLocalBootstrapEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const bootstrapEnv: NodeJS.ProcessEnv = { ...env };
  const releaseValidationDatabaseUrl = bootstrapEnv.RELEASE_VALIDATION_DATABASE_URL;

  if (isLoopbackDatabaseUrl(releaseValidationDatabaseUrl)) {
    bootstrapEnv.FLOOT_DATABASE_URL ??= releaseValidationDatabaseUrl;
    bootstrapEnv.DATABASE_URL ??= releaseValidationDatabaseUrl;
    bootstrapEnv.CRP_LOCAL_DEV ??= "true";
  }

  return bootstrapEnv;
}

export default async function globalSetup() {
  if (!isLocalhostUrl(E2E_BASE_URL)) {
    return;
  }

  const command = process.platform === "win32" ? "cmd.exe" : "pnpm";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "pnpm run bootstrap:local-auth-schema"]
      : ["run", "bootstrap:local-auth-schema"];

  execFileSync(command, args, {
    cwd: process.cwd(),
    env: buildLocalBootstrapEnv(),
    stdio: "inherit",
  });
}
