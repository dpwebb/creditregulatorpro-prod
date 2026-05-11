import { OutputType } from "./scan_POST.schema";

export async function handle() {
  return new Response(
    JSON.stringify({ obligationsReadyForEscalation: [] } satisfies OutputType)
  );
}
