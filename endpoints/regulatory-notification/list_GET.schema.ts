import { z } from "zod";
import { Selectable } from "kysely";
import { RegulatoryNotification } from "../../helpers/schema";

export const REGULATORY_NOTIFICATION_LIST_DEFAULT_LIMIT = 50;
export const REGULATORY_NOTIFICATION_LIST_MAX_LIMIT = 100;

export const schema = z.object({
  unreadOnly: z.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(REGULATORY_NOTIFICATION_LIST_MAX_LIMIT).default(REGULATORY_NOTIFICATION_LIST_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

export type InputType = Partial<z.infer<typeof schema>>;

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
  if (input?.offset !== undefined) {
    url.searchParams.set("offset", String(input.offset));
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
