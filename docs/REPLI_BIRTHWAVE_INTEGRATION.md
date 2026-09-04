# Repli → IGT Lead Admin (Birthwave Instagram leads)

Repli is an **external lead source only**. Leads it captures from Birthwave's
Instagram are POSTed to IGT and stored in the existing Lead Admin
(`birthwave_leads`). There is no separate Repli module, page, or database.

```
Instagram user → Birthwave Instagram → Repli → lead.created / lead.completed webhook
  → IGT verifies X-Repli-Signature → resolves Birthwave client internally
  → normalises phone → delivery dedupe → lead dedupe
  → create OR enrich birthwave_leads row → lead activity → 200
```

Two ingestion paths feed the **same** normalizer and the **same** lead
upsert (`upsertBirthwaveRepliLead` in `repliBirthwaveShared.service.js`), so a
lead entered either way is never duplicated:

```
                     REPLI
                       │
        ┌──────────────┴──────────────┐
        │                             │
 Historical saved leads          New lead events
        │                             │
 GET /leads API (admin sync)     Webhook (lead.created / lead.completed)
        │                             │
        └──────────────┬──────────────┘
                       ↓
         normalizeRepliBirthwaveLead (shared)
                       ↓
         upsertBirthwaveRepliLead (shared)
                       ↓
                 birthwave_leads
                       ↓
                 IGT Lead Admin
```

## Repli events (Repli Developers UI)

| Event | Behaviour |
|---|---|
| `lead.created` | Create Birthwave lead (or enrich if it already exists) |
| `lead.completed` | Enrich the same lead (create if `lead.created` never arrived) |
| `test.ping` | Verify signature only → `200 {success:true, pong:true}`. No lead, no activity. Audited `IGNORED`. |
| `appointment.created` | Ignored → `200 {success:true, ignored:true}`, audited `IGNORED` |
| `message.sent` | Ignored → `200 {success:true, ignored:true}`, audited `IGNORED` |
| missing / unknown | Ignored → `200 {success:true, ignored:true}` |

Lead events are an explicit allowlist (`REPLI_BIRTHWAVE_LEAD_EVENTS`), never
prefix matching. `X-Repli-Event` header is authoritative; the body `event`/`type`
is a fallback and, on disagreement, a stage-only warning.

## API

`POST /api/v1/integrations/repli/birthwave/webhook`

- POST only (any other method → 404).
- No IGT user auth. Authenticated by `X-Repli-Signature`
  (`HMAC-SHA256(rawBody, REPLI_BIRTHWAVE_WEBHOOK_SECRET)`, bare hex or
  `sha256=`-prefixed). Compared timing-safe. Missing/invalid → `401`.
- Excluded from the global API rate limiter; has its own 120 req/min limiter.

### Responses

| Case | HTTP | Body |
|---|---|---|
| New lead created | 200 | `{ success, processed:true, action:"created" }` |
| Existing lead enriched | 200 | `{ success, processed:true, action:"updated" }` |
| Duplicate delivery (lead event) | 200 | `{ success, duplicate:true }` |
| `test.ping` | 200 | `{ success:true, pong:true }` |
| Ignored event (`appointment.created`, `message.sent`, unknown, none) | 200 | `{ success:true, ignored:true }` |
| No phone AND no Repli lead id | 200 | `{ success, processed:false, reason:"missing_phone" }` (audited `IGNORED`) — a phone alone or an external id alone is sufficient; see "Phone is not guaranteed" below |
| Concurrent same-delivery race | 200 | `{ success, duplicate:true }` (UNIQUE index is source of truth, never 500) |
| Bad/missing signature | 401 | `{ success:false, message:"Unauthorized" }` |
| Malformed JSON | 400 | `{ success:false, message:"Invalid JSON body" }` |
| Webhook disabled | 503 | `{ success:false, message:"…disabled" }` |
| Client unresolved / internal error | 500 | `{ success:false, message:… }` |

## Historical lead sync (admin-triggered)

`POST /api/v1/integrations/repli/birthwave/sync`

- **Not a webhook** — normal IGT auth (`Authorization: Bearer <token>`),
  requires `super-admin` or `admin` role (`authenticateManagementToken`). No
  `X-Repli-Signature` is checked or required here.
- Calls Repli's confirmed `GET {REPLI_API_BASE_URL}/leads?limit=&platform=instagram`
  with `Authorization: Bearer <REPLI_API_KEY>` (`repliApi.service.js`).
- Birthwave is resolved server-side the same way as the webhook
  (`REPLI_BIRTHWAVE_CLIENT_KEY`) — there is no client parameter to trust.
- Every fetched record runs through the **same** `normalizeRepliBirthwaveLead`
  and the **same** `upsertBirthwaveRepliLead` the webhook uses, so a lead the
  webhook already created is enriched, not duplicated, and re-running the sync
  is idempotent. See `repliBirthwaveShared.service.js`.
- Records are processed independently (one DB transaction per record) so a
  single bad record does not abort the batch.
- Optional body: `{ "limit": 50 }` (defaults to `REPLI_BIRTHWAVE_SYNC_LIMIT`).

Request:
```bash
curl -X POST "https://<igt-backend-domain>/api/v1/integrations/repli/birthwave/sync" \
  -H "Authorization: Bearer <IGT admin access token>" \
  -H "Content-Type: application/json"
```

Response:
```json
{
  "success": true,
  "fetched": 50,
  "created": 38,
  "updated": 9,
  "skipped": 3,
  "failed": 0,
  "paginationHint": null,
  "failedRecords": [{ "externalId": "some-record-id", "reason": "insufficient_identity" }]
}
```
(`failedRecords[].reason` is `insufficient_identity` when a record has neither
a Repli lead id nor a usable phone — see "Phone is not guaranteed" below. It is
never `missing_phone` for the historical sync; that wording is specific to the
webhook's response.)

`paginationHint` surfaces any of `next`/`next_cursor`/`cursor`/`offset`/
`has_more`/`total`/`page` the API response carries, **without acting on
them** — Repli's Developers UI confirms `limit`/`platform` only; pagination is
intentionally not implemented until a real response confirms its shape (see
"Remaining item" at the end of this doc).

Error responses: `401`/`403` from Repli → `502 {"message":"Unable to fetch Repli leads"}`;
Repli `429`/`5xx`/timeout → same; missing `REPLI_API_KEY`/`REPLI_API_BASE_URL` → `500`.
No IGT-internal error detail or the API key is ever returned to the client.

### Phone is not guaranteed

A confirmed real `/leads` response can be a valid, `status:"completed"` Repli
lead with **no phone question ever asked or answered**. This is not an error
case — `birthwave_leads.phone` is nullable
(`ensureBirthwaveLeadPhoneNullable.js`, see "Database changes") specifically
so this is representable without fabricating a value.

Identity rule (`hasSufficientRepliIdentity`, shared by the webhook and the
sync — see "Deduplication"):

```
external id present            → sufficient, regardless of phone
no external id, phone present  → sufficient (phone fallback)
no external id, no phone       → insufficient → skip / IGNORED
```

No placeholder phone (`"0000000000"`, `"NA"`, the Instagram username, …) is
ever written. If a later webhook or sync run supplies a phone for a lead that
was created phone-less, it is filled in as an enrichment
(`upsertBirthwaveRepliLead`); an existing phone is never overwritten.

### No frontend button (yet)

Adding a "Sync Repli Leads" button to the Birthwave Leads page would need the
existing admin API client wiring reviewed for a bearer-token POST with a
loading/summary toast — left for a follow-up so this change stays backend-only
and reviewable. Trigger the sync via the `curl` command above (or Postman)
until that's added; `useBirthwaveLeadsQuery`'s existing 15 s poll picks up the
new rows on the open Lead Admin tab without any frontend change.

## Environment variables

| Name | Required | Notes |
|---|---|---|
| `REPLI_BIRTHWAVE_WEBHOOK_ENABLED` | **required** | `"true"` to accept deliveries. LOCAL `false`, STAGE `true`, PROD `true`. |
| `REPLI_BIRTHWAVE_WEBHOOK_SECRET` | **required when enabled** | Repli endpoint secret (HMAC key). STAGE + PROD have distinct secrets. Never logged. |
| `REPLI_BIRTHWAVE_CLIENT_KEY` | **required** | `clients.client_key` every delivery maps to. Value: `birthwave`. |
| `REPLI_BIRTHWAVE_WEBHOOK_DEBUG` | optional, **stage only** | `"true"` logs raw headers + body to capture the real payload. Keep `false` in PROD. |
| `REPLI_BIRTHWAVE_WEBHOOK_RATE_LIMIT_MAX` | optional | default `120` / min. |
| `REPLI_API_BASE_URL` | **required for `/sync`** | `https://zwawkzzkpxnexynhzpdx.supabase.co/functions/v1/public-api`. |
| `REPLI_API_KEY` | **required for `/sync`** | IGT → Repli REST auth. **Distinct secret from `REPLI_BIRTHWAVE_WEBHOOK_SECRET`.** Not needed to receive webhooks. Never sent to the frontend, never logged. |
| `REPLI_BIRTHWAVE_SYNC_LIMIT` | optional | default `50` — `GET /leads?limit=`. |

## Repli field → IGT Lead field

| Repli (tolerant of casing / `data`·`lead`·`payload` nesting) | Normalized | `birthwave_leads` |
|---|---|---|
| `name` / `full_name` / `username` | `name` | `name` (fallback `"Instagram Lead"`) |
| `phone` / `phone_number` / `mobile` / `whatsapp` / `wa_id` | `phone` → `normalizePhone` → `+919876543210` | `phone` |
| `email` | `email` | `email` |
| — | `"instagram"` | `source` |
| — | `"REPLI"` | `source_provider` |
| `lead_id` / `external_lead_id` / nested `data.lead.id` | `externalLeadId` | `source_external_id` |
| root-level `id` (meaning unconfirmed) | `rootId` | `integration_metadata.root_id` only |
| `campaign` / `campaign_name` | `campaign` | `integration_metadata.campaign` |
| `lead_score` / `score` | `leadScore` | `integration_metadata.score` |
| `conversation_id` / `thread_id` | `conversationId` | `integration_metadata.conversation_id` |
| `workspace_id` / `account_id` | `workspaceId` | `integration_metadata.workspace_id` |
| `agent_id` / `assistant_id` | `agentId` | `integration_metadata.agent_id` |
| `answers` / `questionnaire` / `responses` / `custom_fields` | `answers` | `integration_metadata.answers` |
| whole body | `rawMetadata` | `integration_webhook_events.payload` |

### Historical `/leads` API record → IGT Lead field (confirmed real shape)

Applies only to `repliApiLeadAdapter.js` (the historical sync), which feeds
its output through the same normalizer above:

```json
{
  "id": "60885461-830e-4a69-bb4b-3f33f0f7bf7c",
  "platform": "instagram",
  "status": "completed",
  "instagram_username": "veera_72",
  "telegram_username": null,
  "collected_data": {
    "What is your name?": "veeravel",
    "What is your email address?": "veeravel.igt@gmail.com",
    "Q3: Which service are you interested in?": "pregnancy care"
  },
  "created_at": "2026-09-04T08:54:01.517907+00:00",
  "completed_at": "2026-09-04T08:55:31.536+00:00"
}
```

| Repli API field | IGT field |
|---|---|
| `id` | `source_external_id` (confirmed for **this endpoint only** — the webhook normalizer still never assumes a root `id` is the lead id) |
| `collected_data["<label containing name>"]` (tolerant: "name", "full name", "your name", …) | `name` (fallback: `instagram_username`, then `"Instagram Lead"`) |
| `collected_data["<label containing email>"]` | `email` |
| `collected_data["<label containing phone/mobile/whatsapp/contact number>"]` | `phone` → `normalizePhone` |
| `platform` | `integration_metadata.platform` |
| `status` | `integration_metadata.repli_status` and `completionState` |
| `instagram_username` | `integration_metadata.instagram_username` |
| `telegram_username` | `integration_metadata.telegram_username` |
| `collected_data` (whole object, unmodified) | `integration_metadata.collected_data` — every answer preserved, including ones not recognized as name/email/phone (e.g. "Which service are you interested in?") |
| `created_at` | `integration_metadata.repli_created_at` |
| `completed_at` | `integration_metadata.repli_completed_at` |

`collected_data` keys are free-form questionnaire question text, not fixed
field names — extraction is a case-insensitive substring match on the label,
not an exact-string match, and is intentionally best-effort (an unusual label
simply lands only in `collected_data`, never lost, never crashes the sync).

Status is always the model default `new_lead`. Assignment, notes, follow-up and
status are **never** written or overwritten by this integration.

## Deduplication

Delivery dedupe and CRM lead dedupe are **independent**. `lead.created` (D1) and
`lead.completed` (D2) are two distinct deliveries that must both be processed and
that update the **same** CRM lead (L1).

- **Delivery dedupe** — `integration_webhook_events` has
  `UNIQUE(provider, delivery_id)`. `delivery_id` = `X-Repli-Delivery` header, else
  `body.delivery_id`/`deliveryId`/`event_id`/`eventId`, else `sha256:<hash of raw
  body>`. The Repli **lead id is never used as the delivery id**. A row already
  `PROCESSED`/`IGNORED` → `200 {duplicate:true}` (or `{pong:true}` for
  `test.ping`), nothing touched, no duplicate activity. A prior `FAILED` row may
  reprocess. A concurrent same-delivery race that loses the `UNIQUE` insert is
  caught and returned as `{duplicate:true}` — never a 500.
- **CRM lead dedupe** (inside one DB transaction), scoped to the Birthwave
  client — never cross-client, never a global `where:{phone}`:
  1. `client_id + source_provider="REPLI" + source_external_id`
  2. else, only if a phone is known: `client_id + phone` (canonical `+91…`), newest first
  Match → enrich (fill-empty `name`/`email`, fill a previously-empty `phone`,
  merge `integration_metadata`: campaign, score, answers, conversation/
  workspace/agent ids, collected_data). CRM-managed fields (status, assigned
  user, notes, follow-up/appointment status, manual custom fields) are never
  touched. No match → create with `source="instagram"`, `source_provider="REPLI"`,
  `status="new_lead"`, `phone` possibly `null` (see "Phone is not guaranteed").

Both the webhook and the historical `/sync` call the **same**
`upsertBirthwaveRepliLead` (`repliBirthwaveShared.service.js`) for this — there
is only one CRM-dedupe implementation. A lead the webhook already created and
one the historical sync later fetches resolve to the same row (matched by
`source_external_id`, or by phone). Running `/sync` twice on the same API
response is a no-op the second time (`action: "updated"` each time after the
first `"created"`), and its `lead_source_activity` entry is written only on the
first creation — a repeat sync never floods the timeline.

## Database changes

- New table `integration_webhook_events` — `provider, client_id, event_type,
  delivery_id, status(RECEIVED|PROCESSED|FAILED|IGNORED), payload JSON,
  error_message, received_at, processed_at, created_at, updated_at`;
  `UNIQUE(provider, delivery_id)` + 3 secondary indexes.
- `birthwave_leads` — added `integration_metadata JSON`; added indexes
  `idx_bw_leads_client_phone`, `idx_bw_leads_client_external_id`.
- `birthwave_leads.phone` relaxed from `NOT NULL` to nullable
  (`ensureBirthwaveLeadPhoneNullable.js`) — a confirmed real Repli `/leads`
  record can be a valid, complete lead with no phone collected. See "Phone
  audit" and "Phone is not guaranteed" above. Manual/API lead creation is
  unaffected — phone is still required there by Joi validation
  (`middlewares/validation/birthwaveValidation.js`), only the column
  constraint changed.
- Enum lists: `BIRTHWAVE_LEAD_SOURCES` += `"instagram"`;
  `BIRTHWAVE_ACTIVITY_EVENT_TYPES` += `"lead_source_activity"`.

Migrations are the repo's idempotent `ensure*` helpers, run from
`connect_mysql()` in `src/app.js` (`ensureIntegrationWebhookEventsTable`,
`ensureBirthwaveLeadIntegrationColumns`, `ensureBirthwaveLeadPhoneNullable`).
No `sync({alter})`. Additive/relaxing only — existing data preserved (a row
with a phone keeps it; nothing is nulled out). Rollback: `DROP TABLE
integration_webhook_events;` `ALTER TABLE birthwave_leads DROP COLUMN
integration_metadata;` + drop the two added indexes; reverting the phone
column to `NOT NULL` requires first backfilling any phone-less rows created by
this integration (`WHERE source_provider='REPLI' AND phone IS NULL`).

## Frontend

The lead is a normal `birthwave_leads` row, so it appears in the existing Lead
Admin list/detail with no new page. `source="instagram"` shows as **Instagram**
in the list column, detail, source filter and dashboard donut (label added to
`LEAD_SOURCE_LABELS`). Lead detail additionally shows **Provider: Repli** and
**Campaign** when present. `useBirthwaveLeadsQuery` now polls every 15 s +
refetch-on-focus so an ingested lead surfaces on an open tab (no Socket.IO for
leads exists yet).

## Automations

Birthwave lead creation has **no** side effects beyond the activity-timeline
row (WhatsApp / appointment / notification automations are PixelEye-only and are
not touched). The Google-Sheet mirror is `birthwave_website_leads`-only. So
ingestion behaves like a plain external lead insert.

## Local test via ngrok

1. **Start the backend.**
   ```bash
   npm run start:dev          # serves on the port in INVICTUS_SERVER_START_LOCAL (8000)
   ```
2. **Start ngrok on that port.**
   ```bash
   ngrok http 8000
   ```
   Copy the `https://<ngrok-domain>` forwarding URL.
3. **Configure the Repli outgoing webhook endpoint** (Repli Developers UI →
   Outgoing Webhooks → Birthwave):
   ```
   https://<ngrok-domain>/api/v1/integrations/repli/birthwave/webhook
   ```
   Subscribe to `lead.created`, `lead.completed`, `test.ping`.
4. **Copy the Signing Secret** shown for that endpoint into `.env`:
   ```env
   REPLI_BIRTHWAVE_WEBHOOK_ENABLED=true
   REPLI_BIRTHWAVE_WEBHOOK_SECRET=<Repli Signing Secret>
   REPLI_BIRTHWAVE_CLIENT_KEY=birthwave
   REPLI_BIRTHWAVE_WEBHOOK_DEBUG=true
   ```
   Restart the backend. (Set `REPLI_BIRTHWAVE_WEBHOOK_DEBUG=false` for production.)
5. **Send `test.ping`** from Repli.
   Expect `200 {"success":true,"pong":true}`. No `birthwave_leads` row is
   created; `integration_webhook_events` gets one `REPLI | test.ping | IGNORED`
   row. Inspect the raw request in the ngrok inspector (`http://127.0.0.1:4040`)
   and the backend debug logs to confirm header names / body shape.
6. **Trigger a real Instagram lead.** Repli sends `lead.created`, then
   `lead.completed` when the questionnaire finishes. Expect:
   - `lead.created` → `200 {processed:true, action:"created"}`
   - `lead.completed` → `200 {processed:true, action:"updated"}`
   - `birthwave_leads` count for Birthwave = **1**, `source="instagram"`,
     `source_provider="REPLI"`, `integration_metadata` populated (campaign,
     answers, …).
   - Lead Admin timeline shows *"Instagram lead received from Repli."* then
     *"Instagram lead details completed in Repli."*
   - `integration_webhook_events` has two distinct `PROCESSED` rows (distinct
     `delivery_id`s).
7. **Re-send the same `lead.created` delivery** → `200 {duplicate:true}`, no new
   lead, no new timeline row.
8. **Confirm the audit table** — no duplicate `(provider, delivery_id)` rows:
   ```
   REPLI | test.ping      | IGNORED   | <delivery A>
   REPLI | lead.created   | PROCESSED | <delivery B>
   REPLI | lead.completed | PROCESSED | <delivery C>
   ```
9. If the debug logs show Repli using field names the normalizer does not yet
   read, extend the key lists in `normalizeRepliBirthwaveLead.js` (no schema
   change needed).

### Negative checks
- Tamper the body or use the wrong secret → `401`, no lead.
- Send `appointment.created` or `message.sent` → `200 {ignored:true}`, no lead.

## Manual test — historical sync

1. Repli Developers → API keys → create a key → copy once → set
   `REPLI_API_KEY` (never commit it).
2. Confirm the Repli API directly:
   ```bash
   curl "https://zwawkzzkpxnexynhzpdx.supabase.co/functions/v1/public-api/leads?limit=50&platform=instagram" \
     -H "Authorization: Bearer <REPLI_API_KEY>"
   ```
   (Windows PowerShell: `curl.exe ...`.) Inspect the real response shape —
   is it a bare array, `{leads:[...]}`, `{data:[...]}`, something else — and
   whether any pagination-looking field is present (see "Remaining item"
   below).
3. As an authenticated `admin`/`super-admin`, call the sync:
   ```bash
   curl -X POST "http://localhost:8000/api/v1/integrations/repli/birthwave/sync" \
     -H "Authorization: Bearer <IGT admin access token>"
   ```
   Confirm the `{fetched, created, updated, skipped, failed}` summary.
4. Check `birthwave_leads` — every synced row has `source="instagram"`,
   `source_provider="REPLI"`, `integration_metadata.sync_source="api"`.
5. Re-run the same sync — expect `created: 0` and the same rows now reported as
   `updated`, not duplicated.
6. Trigger a **new** webhook `lead.created` for a lead that was already
   imported by the historical sync (same `source_external_id` or phone) —
   confirm it enriches that same row rather than creating a second one.

## Remaining item — pagination

The Repli Developers UI confirms `limit`/`platform` only; it does not confirm a
pagination shape. This implementation intentionally does **not** guess one.
`extractRepliPaginationHint()` (`repliApi.service.js`) surfaces any of
`next`/`next_cursor`/`cursor`/`offset`/`has_more`/`total`/`page` present on the
real response as `paginationHint` in the sync result, without acting on them.
**After running step 2 above against the live API**, report the exact shape
found and a follow-up patch can implement the correct pagination loop —
guessing it now risks silently dropping leads beyond the first page.
