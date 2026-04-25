import { z } from "zod";
import superjson from "superjson";

export const schema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "model", "assistant"]),
      content: z.string(),
    })
  ),
  forceEscalate: z.boolean().optional(),
});

export type InputType = z.infer<typeof schema>;

// We return a raw Response because this is an SSE stream.
export const postAiChat = async (
  body: InputType,
  init?: RequestInit
): Promise<Response> => {
  // We map assistant to model for gemini format compatibility but allow both in schema
  const mappedBody = {
    ...body,
    messages: body.messages.map((m) => ({
      ...m,
      role: m.role === "assistant" ? "model" : m.role,
    })),
  };

  const validatedInput = schema.parse(mappedBody);
  
  return fetch(`/_api/support/ai-chat`, {
    method: "POST",
    body: superjson.stringify(validatedInput),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
};