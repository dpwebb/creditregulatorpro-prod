import { z } from "zod";

import type { ConsumerIdentificationMetadata } from "../../helpers/consumerIdentification";

export const schema = z.object({
  fileName: z.string().min(1, "Identification file name is required"),
  fileType: z.enum(["image/jpeg", "image/png"], {
    errorMap: () => ({ message: "Upload a PNG or JPEG image of your identification" }),
  }),
  fileDataBase64: z.string().min(1, "Identification image is required"),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  identification: ConsumerIdentificationMetadata;
};

export const postConsumerIdentification = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/user/identification`, {
    method: "POST",
    body: JSON.stringify(validatedInput),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!result.ok) {
    const errorObject = JSON.parse(await result.text());
    throw new Error(errorObject.error);
  }

  return JSON.parse(await result.text());
};
