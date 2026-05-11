import { OutputType } from "./select_POST.schema";

const RESET_MESSAGE =
  "Legacy dispute planner has been reset and is not available in this build.";

export async function handle() {
  return new Response(
    JSON.stringify({ error: RESET_MESSAGE } satisfies OutputType),
    { status: 410 }
  );
}
