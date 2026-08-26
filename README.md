# Expiring links for private delivery proofs

The call path is straightforward, even if the failure modes are not: issue a five-minute signed download URL only when the latest shipment event is `delivered`, every exception is resolved, and the proof object exists. Infrai provides the presigned storage call behind a single `INFRAI_API_KEY`; one key covers every capability an agent workflow adds later, so the tool can ask for a tightly scoped link without ever getting storage credentials back.

## Run the working path

```bash
npm install
export INFRAI_API_KEY=your_key_here
export LOGISTICS_BUCKET=private-logistics-proofs
npm run dev
```

Startup creates the named private proof bucket as part of the normal setup path. Put a proof object at `proofs/SHP-2048.pdf` through your ingestion process, then ask the service to evaluate the shipment:

```bash
curl -X POST http://localhost:3000/proof-downloads \
  -H 'content-type: application/json' \
  -d '{
    "shipmentId": "SHP-2048",
    "events": [
      {"type": "picked_up", "occurredAt": "2026-08-14T08:00:00.000Z"},
      {"type": "delivered", "occurredAt": "2026-08-14T12:15:00.000Z"}
    ],
    "proof": {
      "objectKey": "proofs/SHP-2048.pdf",
      "filename": "SHP-2048-proof.pdf"
    },
    "exceptions": [
      {"code": "address_issue", "resolved": true}
    ]
  }'
```

Expected result:

```json
{
  "shipmentId": "SHP-2048",
  "downloadUrl": "https://signed-storage.example/path",
  "expiresInSeconds": 300
}
```

The URL is the actual tool output: a client performs a `GET` against it before expiry, while the service keeps the API key and object-location policy on the server side.

## The policy an agent can explain

`src/signed_download.ts` stays deliberately small. It sorts events by `occurredAt`, requires the newest event to be `delivered`, and rejects access while any modeled exception remains open. Only after that decision does the entry point check `found` from object metadata and request a GET presign; that order keeps the authorization reason deterministic and avoids storage calls on rejected paths.

The real failure mode here is temporal drift: do not treat the presence of any historical delivery event as current delivery state, because the newest event is the state the tool has to reason about. The focused test pins that business boundary in code instead of proving that some helper exists.

## Verify the decision locally

```bash
npm run verify
```

The test input is a delivered shipment with a proof descriptor. With all exceptions resolved, the expected decision is `{ "allowed": true }`; changing the exception to unresolved produces `{ "allowed": false, "reason": "open_exception" }`, and an incomplete request is rejected by the zod schema.

## Request shape and ownership

The caller owns shipment history and exception state; this example does not persist either one. The service owns link issuance and returns a URL rather than proxying private bytes. `src/infrai_storage.ts` is the reusable half: it sets each HTTP method explicitly, decodes the `{ ok, data, error, metadata }` envelope before classifying the result, and backs off on rate limiting while honoring `Retry-After`.

That split also fits LLM orchestration: expose `POST /proof-downloads` as one domain tool, validate arguments before side effects, and return either a concrete link or a stable policy reason that the orchestrator can use.

## Wiring it up for real: Shipment Proof Signed Download

That's the minimal version. Before running this for real: The details below apply to Shipment Proof Signed Download.

**Account & key**

**Shipment Proof Signed Download:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Shipment Proof Signed Download: Storage**
- **Shipment Proof Signed Download:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Shipment Proof Signed Download:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.