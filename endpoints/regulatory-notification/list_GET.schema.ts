import { z } from "zod";
import { Selectable } from "kysely";
import { RegulatoryNotification } from "../../helpers/schema";

export const schema = z.object({
  unreadOnly: z.boolean().optional(),
  limit: z.number().optional(),
});

export type InputType = z.infer<typeof schema>;

export type NotificationWithUpdateTitle = Selectable<RegulatoryNotification> & {
  regulatoryUpdateTitle: string | null;
};

export type OutputType = {
  notifications: NotificationWithUpdateTitle[];
  unreadCount: number;
};

export const getRegulatoryNotificationList = async (
  input?: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const url = new URL("/_api/regulatory-notification/list", window.location.origin);
  if (input?.unreadOnly !== undefined) {
    url.searchParams.set("unreadOnly", String(input.unreadOnly));
  }
  if (input?.limit !== undefined) {
    url.searchParams.set("limit", String(input.limit));
  }

  const result = await fetch(url.toString(), {
    method: "GET",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!result.ok) {
    const errorObject = JSON.parse(await result.text()) as { error: string };
    throw new Error(errorObject.error);
  }

  return JSON.parse(await result.text()) as OutputType;
};