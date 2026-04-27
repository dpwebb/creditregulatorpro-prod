import { z } from "zod";
import { User } from "../../helpers/User";

export const schema = z.object({
  email: z.string().email("Email is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  displayName: z.string().min(1, "Name is required"),
  termsAccepted: z.literal(true, { errorMap: () => ({ message: "You must accept the Terms of Use" }) }),
  dataConsentAccepted: z.literal(true, { errorMap: () => ({ message: "You must consent to data use" }) }),
  legalNameSignature: z.string().min(2, "Please type your full legal name"),
  tempArtifactId: z.number().int().positive().optional(),
  claimToken: z.string().min(1).optional(),
});

export type OutputType = {
  user: User;
  claimedArtifactId?: number;
};

export const postRegister = async (
  body: z.infer<typeof schema>,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/auth/register_with_password`, {
    method: "POST",
    body: JSON.stringify(validatedInput),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "include", // Important for cookies to be sent and received
  });

  if (!result.ok) {
    const errorData = await result.json();
        throw new Error(errorData.error || errorData.message || "Registration failed");
  }

  return result.json();
};