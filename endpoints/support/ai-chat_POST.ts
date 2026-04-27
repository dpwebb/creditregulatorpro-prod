import { schema } from "./ai-chat_POST.schema";
import superjson from "superjson";
import { db } from "../../helpers/db";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { sendGridEmail } from "../../helpers/sendGridEmail";
import { getAISupportSystemPrompt } from "../../helpers/aiSupportContext";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";

const SUPPORT_LEAD_EMAIL = "donna@creditregulatorpro.com"; // TODO: make configurable in systemSettings

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const json = superjson.parse(await request.text());
    const { messages, forceEscalate } = schema.parse(json);

    const apiKey = process.env.GOOGLE_GEMINI_SA_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_GEMINI_SA_KEY is not configured.");
    }

    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        const sendEvent = (type: string, data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`));
        };

        const createEscalationTicket = async (reason: string, transcript: string) => {
          const newTicket = await db
            .insertInto("supportTicket")
            .values({
              userId: user.id,
              subject: `AI Escalation: Support Request from ${user.displayName || user.email}`,
              description: `Automated Escalation Reason: ${reason}\n\nConversation Transcript:\n${transcript}`,
              category: "OTHER",
              priority: "MEDIUM",
              status: "OPEN",
              region: "CA",
            })
            .returningAll()
            .executeTakeFirstOrThrow();

          await sendGridEmail({
            to: SUPPORT_LEAD_EMAIL,
            subject: `New AI Escalated Ticket: #${newTicket.id}`,
            html: `
              <p>A user has been escalated from the AI Support Assistant.</p>
              <p><strong>Reason:</strong> ${reason}</p>
              <p><strong>User:</strong> ${user.email}</p>
              <p><a href="https://creditregulatorpro.com/support-tickets/${newTicket.id}">View Ticket #${newTicket.id}</a></p>
            `,
          }).catch(console.error);

          return newTicket.id;
        };

        const fullTranscript = messages
          .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
          .join("\n\n");

        if (forceEscalate) {
          sendEvent("chunk", { content: "I'm connecting you with our support lead Donna...\n\n" });
          
          const ticketId = await createEscalationTicket("User forced human escalation", fullTranscript);
          sendEvent("escalated", { ticketId });
          sendEvent("done", {});
          controller.close();
          return;
        }

        // Call Gemini 2.5 Flash
        const geminiRequestBody = {
          systemInstruction: {
            parts: [{ text: getAISupportSystemPrompt() }],
          },
          contents: messages.map((m) => ({
            role: m.role,
            parts: [{ text: m.content }],
          })),
          generationConfig: {
            temperature: 0.7,
          },
        };

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(geminiRequestBody),
          }
        );

        if (!geminiRes.ok) {
          console.error("Gemini Error:", await geminiRes.text());
          sendEvent("error", { message: "Failed to communicate with AI support agent." });
          controller.close();
          return;
        }

        const reader = geminiRes.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let isEscalated = false;
        let escalationDataBuffer = "";
        let fullAssistantResponse = "";
        const ESCALATION_MARKER = ":::ESCALATE:::";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const dataStr = line.slice(6).trim();
                if (!dataStr) continue;
                
                let dataObj;
                try {
                  dataObj = JSON.parse(dataStr);
                } catch { continue; }

                const parts = dataObj.candidates?.[0]?.content?.parts;
                if (parts && parts.length > 0 && parts[0].text) {
                  const text = parts[0].text;
                  fullAssistantResponse += text;

                  if (isEscalated) {
                    escalationDataBuffer += text;
                  } else {
                    buffer += text;
                    const markerIndex = buffer.indexOf(ESCALATION_MARKER);
                    
                    if (markerIndex !== -1) {
                      isEscalated = true;
                      const visibleText = buffer.slice(0, markerIndex);
                      if (visibleText) {
                        sendEvent("chunk", { content: visibleText });
                      }
                      escalationDataBuffer += buffer.slice(markerIndex + ESCALATION_MARKER.length);
                      buffer = ""; 
                    } else {
                      // Sliding window to prevent streaming partial marker
                      if (buffer.length > 30) {
                        const safeToSend = buffer.slice(0, -30);
                        sendEvent("chunk", { content: safeToSend });
                        buffer = buffer.slice(-30);
                      }
                    }
                  }
                }
              }
            }
          }

          // Flush any remaining buffer if we never escalated
          if (!isEscalated && buffer.length > 0) {
            sendEvent("chunk", { content: buffer });
          }

          if (isEscalated) {
            let reason = "Automated escalation triggered by AI";
            try {
              const escData = JSON.parse(escalationDataBuffer.trim() || "{}");
              if (escData.reason) reason = escData.reason;
            } catch (e) {
              console.error("Failed to parse escalation reason:", escalationDataBuffer);
            }

            const finalTranscript = fullTranscript + `\n\nMODEL: ${fullAssistantResponse}`;
            const ticketId = await createEscalationTicket(reason, finalTranscript);
            sendEvent("escalated", { ticketId });
          }

          sendEvent("done", {});
        } catch (error) {
          console.error("Error during streaming:", error);
          sendEvent("error", { message: "Stream interrupted." });
        } finally {
          controller.close();
          reader.releaseLock();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}