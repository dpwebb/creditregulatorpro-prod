import { fileURLToPath } from "node:url";

import {
  AUTH_WORKFLOW_SMOKE_ENV,
  runCli,
} from "./staging-auth-workflow-smoke";

export function buildPacketWorkflowSmokeEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...env,
    [AUTH_WORKFLOW_SMOKE_ENV]: "true",
    CRP_AUTH_WORKFLOW_SMOKE_INCLUDE_PACKET: "true",
  };
}

export async function runPacketWorkflowSmokeCli(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  return runCli(buildPacketWorkflowSmokeEnv(env));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runPacketWorkflowSmokeCli().then((code) => {
    process.exitCode = code;
  });
}
