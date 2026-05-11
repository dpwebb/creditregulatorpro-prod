import { OutputType } from "./trigger_POST.schema";

const RESET_MESSAGE =
  "Legacy dispute escalation has been reset and is not available in this build.";

export async function handle() {
  return new Response(
    JSON.stringify({ error: RESET_MESSAGE } satisfies OutputType),
    { status: 410 }
  );
}
