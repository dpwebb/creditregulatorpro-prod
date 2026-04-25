import { schema, OutputType } from "./reminder_POST.schema";

import { db } from "../../helpers/db";
import { checkRateLimit } from "../../helpers/rateLimiter";

export async function handle(request: Request) {
  try {
    const text = await request.text();
    const json = JSON.parse(text);
    const result = schema.parse(json);

    // Rate limiting (5 requests per IP per hour)
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown-ip";
    const rateLimit = await checkRateLimit(ip, "LEAD_REMINDER", 5, 60);

    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ error: "Too many requests. Please try again later." }),
        { status: 429 }
      );
    }

    const emailNorm = result.email.toLowerCase().trim();

    // Check if it already exists to prevent duplicate emails
    const existing = await db
      .selectFrom("leadReminder")
      .select("id")
      .where("email", "=", emailNorm)
      .executeTakeFirst();

    if (!existing) {
      await db
        .insertInto("leadReminder")
        .values({
          email: emailNorm,
          source: "try-upload-guide",
        })
        .execute();
    }

    return new Response(JSON.stringify({ success: true } satisfies OutputType));
  } catch (error) {
    console.error("Lead reminder error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    return new Response(JSON.stringify({ error: errorMessage }), { status: 400 });
  }
}