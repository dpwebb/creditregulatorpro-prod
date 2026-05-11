import { OutputType } from "./auto-trigger_POST.schema";

export async function handle() {
  return new Response(
    JSON.stringify({
      success: true,
      summary: {
        scannedCount: 0,
        triggeredCount: 0,
        errors: [],
      },
    } satisfies OutputType)
  );
}
