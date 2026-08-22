import { z } from "zod";

export const downloadRequestSchema = z.object({
  shipmentId: z.string().min(1).max(80),
  events: z.array(z.object({
    type: z.enum(["picked_up", "in_transit", "delivered"]),
    occurredAt: z.string().datetime(),
  })).min(1),
  proof: z.object({
    objectKey: z.string().min(1).max(512),
    filename: z.string().min(1).max(160),
  }),
  exceptions: z.array(z.object({
    code: z.enum(["address_issue", "damaged", "delivery_disputed"]),
    resolved: z.boolean(),
  })).default([]),
});

export type DownloadRequest = z.infer<typeof downloadRequestSchema>;
export type DownloadDecision =
  | { allowed: true }
  | { allowed: false; reason: "shipment_not_delivered" | "open_exception" };

export function decideProofAccess(request: DownloadRequest): DownloadDecision {
  const latestEvent = [...request.events].sort(
    (left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt),
  )[0];
  if (latestEvent.type !== "delivered") {
    return { allowed: false, reason: "shipment_not_delivered" };
  }
  if (request.exceptions.some((exception) => !exception.resolved)) {
    return { allowed: false, reason: "open_exception" };
  }
  return { allowed: true };
}
