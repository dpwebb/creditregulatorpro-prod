const PACKET_GENERATION_RESET_MESSAGE =
  "Packet generation has been reset and is not available in this build.";

export async function handle(_request: Request) {
  return new Response(
    JSON.stringify({ error: PACKET_GENERATION_RESET_MESSAGE }),
    {
      status: 410,
      headers: { "Content-Type": "application/json" },
    }
  );
}
