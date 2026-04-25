import { db } from "./db";
import { sendGridEmail } from "./sendGridEmail";

/**
 * Daily cron job that:
 * 1. Sends renewal reminder emails 3 days before subscription renewal.
 * 2. Sends lead reminder emails for leads that signed up > 24 hours ago and haven't been reminded yet.
 *
 * Uses sendGridEmail for delivery.
 */
export async function cronSubReminder(): Promise<void> {
  // ── Phase 1: Subscription renewal reminders ──────────────────────────────
  const now = new Date();
  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(now.getDate() + 3);

  try {
    const subsToRemind = await db
      .selectFrom("subscriptions")
      .innerJoin("users", "users.id", "subscriptions.userId")
      .select([
        "subscriptions.id as subId",
        "subscriptions.plan",
        "subscriptions.priceCad",
        "subscriptions.currentPeriodEnd",
        "subscriptions.currentPeriodStart",
        "users.email",
        "users.displayName",
      ])
      .where("subscriptions.status", "=", "active")
      .where("subscriptions.currentPeriodEnd", "is not", null)
      .where("subscriptions.currentPeriodEnd", ">=", now)
      .where("subscriptions.currentPeriodEnd", "<=", threeDaysFromNow)
      .where((eb) =>
        eb.or([
          eb("subscriptions.renewalReminderSentAt", "is", null),
          eb(
            "subscriptions.renewalReminderSentAt",
            "<",
            eb.ref("subscriptions.currentPeriodStart")
          ),
        ])
      )
      .execute();

    if (subsToRemind.length === 0) {
      console.log("cronSubReminder [phase 1]: No subscriptions require renewal reminders at this time.");
    } else {
      console.log(`cronSubReminder [phase 1]: Found ${subsToRemind.length} subscriptions to remind.`);

      for (const sub of subsToRemind) {
        if (!sub.currentPeriodEnd || !sub.email) {
          console.warn(`cronSubReminder [phase 1]: Skipping sub ${sub.subId} due to missing period end or email.`);
          continue;
        }

        try {
          const renewDate = new Date(sub.currentPeriodEnd);
          const formattedDate = new Intl.DateTimeFormat("en-CA", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }).format(renewDate);

          const priceNum = sub.priceCad
            ? Number(sub.priceCad)
            : sub.plan === "annual"
              ? 49.99
              : 19.0;

          const formattedPrice = new Intl.NumberFormat("en-CA", {
            style: "currency",
            currency: "CAD",
          }).format(priceNum);

          const planName =
            sub.plan === "annual"
              ? "Annual"
              : sub.plan === "monthly"
                ? "Monthly"
                : "Free Trial";

          const subject = "Your Credit Regulator Pro plan renews soon";

          const html = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.5;">
              <h2 style="color: #1a365d;">Your plan renews soon</h2>
              <p>Hi ${sub.displayName || "there"},</p>
              <p>Your ${planName} plan (${formattedPrice} CAD) renews on <strong>${formattedDate}</strong>.</p>
              <p>We are so glad to have you with us. You can keep using all features to protect your credit and stay in control.</p>
              
              <div style="margin: 30px 0;">
                <a href="https://www.creditregulatorpro.com/profile-settings" 
                   style="display: inline-block; background-color: #1a365d; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; text-align: center;">
                  Yes, I approve this payment
                </a>
              </div>
              
              <p style="margin-top: 30px; font-size: 0.875rem;">
                Need to make a change? 
                <br/>
                <a href="https://www.creditregulatorpro.com/profile-settings" style="color: #666; text-decoration: underline;">Cancel my subscription</a>
              </p>
            </div>
          `;

          const text = `Hi ${sub.displayName || "there"},\n\nYour ${planName} plan (${formattedPrice} CAD) renews on ${formattedDate}.\n\nWe are so glad to have you with us. You can keep using all features to protect your credit and stay in control.\n\nTo approve this payment, go here: https://www.creditregulatorpro.com/profile-settings\n\nTo cancel your subscription, go here: https://www.creditregulatorpro.com/profile-settings`;

          const emailResult = await sendGridEmail({
            to: sub.email,
            subject,
            html,
            text,
          });

          if (emailResult.success) {
            console.log(
              `cronSubReminder [phase 1]: Successfully sent renewal reminder to ${sub.email} for subscription ${sub.subId}.`
            );

            await db
              .updateTable("subscriptions")
              .set({ renewalReminderSentAt: new Date() })
              .where("id", "=", sub.subId)
              .execute();
          } else {
            console.error(
              `cronSubReminder [phase 1]: Failed to send reminder to ${sub.email}:`,
              emailResult.error
            );
          }
        } catch (err) {
          console.error(
            `cronSubReminder [phase 1]: Error processing subscription reminder for subId ${sub.subId}:`,
            err instanceof Error ? err.message : err
          );
        }
      }
    }
  } catch (error) {
    console.error(
      "cronSubReminder [phase 1]: Failed to execute subscription reminders query:",
      error instanceof Error ? error.message : error
    );
  }

  // ── Phase 2: Lead reminders ───────────────────────────────────────────────
  try {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const pendingReminders = await db
      .selectFrom("leadReminder")
      .select(["id", "email"])
      .where("remindedAt", "is", null)
      .where("createdAt", "<", yesterday)
      .limit(50)
      .execute();

    if (pendingReminders.length === 0) {
      console.log("cronSubReminder [phase 2]: No lead reminders to send at this time.");
      return;
    }

    console.log(`cronSubReminder [phase 2]: Found ${pendingReminders.length} lead reminders to send.`);

    let sentCount = 0;

    for (const reminder of pendingReminders) {
      try {
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
          text: "You asked us to remind you to check your credit report. Visit https://www.creditregulatorpro.com/try-upload to get started.",
        });

        if (emailResult.success) {
          await db
            .updateTable("leadReminder")
            .set({ remindedAt: new Date() })
            .where("id", "=", reminder.id)
            .execute();

          sentCount++;
        } else {
          console.error(
            `cronSubReminder [phase 2]: Failed to send lead reminder to ${reminder.email}:`,
            emailResult.error
          );
        }
      } catch (err) {
        console.error(
          `cronSubReminder [phase 2]: Error processing lead reminder id ${reminder.id}:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    console.log(`cronSubReminder [phase 2]: Successfully sent ${sentCount} of ${pendingReminders.length} lead reminders.`);
  } catch (error) {
    console.error(
      "cronSubReminder [phase 2]: Failed to execute lead reminders query:",
      error instanceof Error ? error.message : error
    );
  }
}