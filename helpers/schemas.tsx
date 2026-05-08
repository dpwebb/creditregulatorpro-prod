import { z } from "zod";

export const UploadReportInput = z.object({
  region: z.literal("CA"),
  fileName: z.string(),
  mimeType: z.string(),
  bytesBase64: z.string(),
}).strict();

export type UploadReportInputType = z.infer<typeof UploadReportInput>;

export const TrackingWebhookInput = z.object({
  packetId: z.string().uuid(),
  status: z.enum(["DELIVERED", "RETURNED", "IN_TRANSIT", "RESPONDED"]),
  payload: z.any(),
});

export type TrackingWebhookInputType = z.infer<typeof TrackingWebhookInput>;
