import { schema, OutputType } from "./send-reminders_POST.schema";

import { db } from "../../helpers/db";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { sendGridEmail } from "../../helpers/sendGridEmail";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    
    if (user.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Unauthorized access" }),
        { status: 403 }
      );
    }

    const text = await request.text();
    const json = JSON.parse(text);
    schema.parse(json); // Validate empty body

    // 24 hours ago
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Find pending reminders
    const pendingReminders = await db
      .selectFrom("leadReminder")
      .select(["id", "email"])
      .where("remindedAt", "is", null)
      .where("createdAt", "<", yesterday)
      .limit(50) // Process in chunks to prevent timeout
      .execute();

    let sentCount = 0;

    for (const reminder of pendingReminders) {
      const emailResult = await sendGridEmail({
        to: reminder.email,
        subject: "Ready to check your credit report?",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <h2 style="color: #0B0B0B;">Your Credit Report Reminder</h2>
            <p>Hi there,</p>
            <p>You asked us to remind you to check your Canadian credit report.</p>
            <p>It's completely free and only takes a few minutes to download from Equifax or TransUnion.</p>
            <p>Once you have the PDF, you can upload it to Credit Regulator Pro to instantly detect any errors or compliance violations.</p>
            <div style="margin: 30px 0;">
              <a href="https://www.creditregulatorpro.com/try-upload" style="background-color: #FF2A2A; color: #FFFFFF; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Upload Your Report Now</a>
            </div>
            <p style="font-size: 12px; color: #999; margin-top: 40px;">
              You're receiving this because you opted into a one-time reminder at Credit Regulator Pro. 
              We will not email you again unless you request another reminder.
            </p>
          </div>
        `,
        text: "You asked us to remind you to check your credit report. Visit https://www.creditregulatorpro.com/try-upload to get started."
      });

      if (emailResult.success) {
        await db
          .updateTable("leadReminder")
          .set({ remindedAt: new Date() })
          .where("id", "=", reminder.id)
          .execute();
          
        sentCount++;
      } else {
        console.error(`Failed to send reminder to ${reminder.email}:`, emailResult.error);
      }
    }

    return new Response(JSON.stringify({ success: true, count: sentCount } satisfies OutputType));
  } catch (error) {
    console.error("Send reminders error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    // If it's a NotAuthenticatedError from getServerUserSession, it will be thrown and caught here
    return new Response(JSON.stringify({ error: errorMessage }), { status: 401 });
  }
}