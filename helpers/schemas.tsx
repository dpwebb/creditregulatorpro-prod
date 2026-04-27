import { z } from "zod";

export const UploadReportInput = z.object({
  userId: z.string().optional(), // Optional: use authenticated session if not provided
  region: z.literal("CA"),
  fileName: z.string(),
  mimeType: z.string(),
  bytesBase64: z.string(),
});

export type UploadReportInputType = z.infer<typeof UploadReportInput>;

export const TrackingWebhookInput = z.object({
  packetId: z.string().uuid(),
  status: z.enum(["DELIVERED", "RETURNED", "IN_TRANSIT", "RESPONDED"]),
  payload: z.any(),
});

export type TrackingWebhookInputType = z.infer<typeof TrackingWebhookInput>;