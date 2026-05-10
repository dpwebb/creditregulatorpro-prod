import { execFileSync } from "node:child_process";
import { E2E_BASE_URL } from "./e2eAuth";
import { isLocalhostUrl } from "../../scripts/localAdminAuth";

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
    stdio: "inherit",
  });
}
