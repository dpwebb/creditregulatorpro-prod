import { z } from "zod";
import { User } from "../../helpers/User";

export const schema = z.object({
  email: z.string().email("Email is required"),
  password: z.string().min(1, "Password is required"),
});

export type OutputType = {
  user: User;
};

async function readJsonResponse<T>(
  response: Response,
  emptyMessage: string,
  invalidMessage: string
): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(emptyMessage);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(invalidMessage);
  }
}

export const postLogin = async (
  body: z.infer<typeof schema>,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);

  let result: Response;
  try {
    result = await fetch(`/_api/auth/login_with_password`, {
      method: "POST",
      body: JSON.stringify(validatedInput),
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      credentials: "include", // Important for cookies to be sent and received
    });
  } catch {
    throw new Error("Login service is unavailable. Please try again.");
  }

  if (!result.ok) {
    const errorData = await readJsonResponse<{ error?: unknown; message?: unknown }>(
      result,
      "Login service did not return an error response. Please try again.",
      "Login service returned an invalid error response. Please try again."
    );
    const message = typeof errorData.error === "string"
      ? errorData.error
      : typeof errorData.message === "string"
        ? errorData.message
        : "Login failed";
    throw new Error(message);
  }

  return readJsonResponse<OutputType>(
    result,
    "Login service returned an empty response. Please try again.",
    "Login service returned an invalid response. Please try again."
  );
};
