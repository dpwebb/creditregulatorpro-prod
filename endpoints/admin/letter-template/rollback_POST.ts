import { OutputType } from "./rollback_POST.schema";

const RESET_MESSAGE =
  "Legacy dispute-letter templates have been reset and are not available in this build.";

export async function handle() {
  return new Response(
    JSON.stringify({ error: RESET_MESSAGE } satisfies OutputType),
    { status: 410 }
  );
}
