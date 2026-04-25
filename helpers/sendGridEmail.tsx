import { z } from "zod";

export async function sendGridEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    throw new Error("Missing SendGrid environment variables.");
  }

  const content = [];
  if (text) {
    content.push({ type: "text/plain", value: text });
  }
  content.push({ type: "text/html", value: html });

  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: to }],
          },
        ],
        from: { email: fromEmail },
        subject,
        content,
      }),
    });

    if (response.ok) {
      return { success: true, statusCode: response.status };
    } else {
      const errorText = await response.text();
      return { success: false, statusCode: response.status, error: errorText };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}