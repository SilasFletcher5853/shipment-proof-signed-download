import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { infrai, InfraiError } from "./infrai_storage.js";
import { decideProofAccess, downloadRequestSchema } from "./signed_download.js";

const BUCKET = process.env.LOGISTICS_BUCKET ?? "private-logistics-proofs";
const PORT = Number(process.env.PORT ?? 3000);

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readBody(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function start(): Promise<void> {
  createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/proof-downloads") {
      json(response, 404, { error: "route_not_found" });
      return;
    }

    try {
      const input = downloadRequestSchema.parse(await readBody(request));
      const decision = decideProofAccess(input);
      if (!decision.allowed) {
        json(response, 409, decision);
        return;
      }

      const object = await infrai.storage.object.head(BUCKET, input.proof.objectKey);
      if (!object.found) {
        json(response, 404, { error: "proof_not_found", shipmentId: input.shipmentId });
        return;
      }

      const disposition = `attachment; filename="${input.proof.filename.replace(/["\\]/g, "_")}"`;
      const signed = await infrai.storage.object.presign(BUCKET, input.proof.objectKey, {
        op: "get",
        expires_seconds: 300,
        response_disposition: disposition,
        idempotency_key: `proof-download-${input.shipmentId}`,
      });
      json(response, 200, {
        shipmentId: input.shipmentId,
        downloadUrl: signed.url,
        expiresInSeconds: 300,
      });
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        json(response, 400, { error: "invalid_request" });
      } else if (error instanceof InfraiError) {
        json(response, error.status >= 400 && error.status < 500 ? error.status : 502, {
          error: error.detail.code ?? "storage_request_rejected",
        });
      } else {
        json(response, 500, { error: "internal_error" });
      }
    }
  }).listen(PORT, () => {
    console.log(`Logistics proof service listening on http://localhost:${PORT}`);
  });
}

void start();
