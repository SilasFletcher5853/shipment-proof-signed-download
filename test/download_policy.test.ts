import assert from "node:assert/strict";
import test from "node:test";
import { decideProofAccess, downloadRequestSchema } from "../src/signed_download.js";

const deliveredShipment = {
  shipmentId: "SHP-2048",
  events: [
    { type: "picked_up" as const, occurredAt: "2026-08-14T08:00:00.000Z" },
    { type: "delivered" as const, occurredAt: "2026-08-14T12:15:00.000Z" },
  ],
  proof: { objectKey: "proofs/SHP-2048.pdf", filename: "SHP-2048-proof.pdf" },
  exceptions: [{ code: "address_issue" as const, resolved: true }],
};

test("allows proof access after delivery when every exception is resolved", () => {
  const input = downloadRequestSchema.parse(deliveredShipment);
  assert.deepEqual(decideProofAccess(input), { allowed: true });
});

test("blocks proof access while a delivery exception remains open", () => {
  const input = downloadRequestSchema.parse({
    ...deliveredShipment,
    exceptions: [{ code: "delivery_disputed", resolved: false }],
  });
  assert.deepEqual(decideProofAccess(input), { allowed: false, reason: "open_exception" });
});

test("rejects an incomplete request at the HTTP boundary schema", () => {
  assert.equal(downloadRequestSchema.safeParse({ shipmentId: "SHP-2048" }).success, false);
});
