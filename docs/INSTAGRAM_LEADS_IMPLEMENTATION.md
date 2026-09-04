# Instagram Leads (Repli → Birthwave) — Full Implementation Flow

How Birthwave's Instagram leads get from a DM conversation in Repli into the
existing IGT Lead Admin, and how they're surfaced as a dedicated "Instagram
Leads" view. Written after the fact, describing what was actually built.

## Guiding rule

Repli is an **external lead source only**. There is no separate Repli
module, page, database table, or lead-management system. Every Instagram
lead is a normal row in the existing `birthwave_leads` table, tagged
`source = "instagram"`, `source_provider = "REPLI"`. "Instagram Leads" in the
UI is just a filtered view over that same table.

```
Instagram user
      │
      ▼
Birthwave Instagram (DM / questionnaire)
      │
      ▼
                         REPLI
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
 Historical leads already in Repli      New lead events, live
        │                                     │
 GET /leads (Repli REST API)          Outgoing webhook
 → IGT admin-triggered sync           lead.created / lead.completed
        │                                     │
        └──────────────────┬──────────────────┘
                           ▼
              Shared normalizer + shared upsert
           (normalizeRepliBirthwaveLead / upsertBirthwaveRepliLead)
                           ▼
                     birthwave_leads
                           ▼
              IGT Lead Admin — "All Leads" (source filter)
              IGT Lead Admin — "Instagram Leads" (fixed filter)
```

---

## 1. Backend: receiving leads

### 1.1 Live webhook — `POST /api/v1/integrations/repli/birthwave/webhook`

Repli calls this endpoint directly whenever something happens on the
Instagram side. No IGT login is involved — the request authenticates itself.

**Files:** `src/modules/integrations/repli/{repliWebhook.routes,repliWebhook.controller,repliWebhook.service}.js`

- **Signature verification** (`verifyRepliWebhook.js`): Repli signs every
  request with `X-Repli-Signature = HMAC-SHA256(raw request body, endpoint
  Signing Secret)`. IGT recomputes that HMAC over the **exact raw bytes**
  (captured via `express.json({ verify: (req,_res,buf) => req.rawBody = buf })`
  in `app.js`, *before* JSON parsing — never `JSON.stringify(req.body)`), and
  compares it with `crypto.timingSafeEqual`. Accepts a bare hex signature or
  a `sha256=`-prefixed one. Missing/invalid → `401`, nothing else runs.
- **Event allowlist**: only two events create/update leads —
  ```js
  const REPLI_BIRTHWAVE_LEAD_EVENTS = new Set(["lead.created", "lead.completed"]);
  ```
  `X-Repli-Event` header is authoritative over any `event`/`type` field in
  the body. `test.ping` is a connectivity check only — verified, then
  `200 {success:true, pong:true}`, no lead, no activity. Anything else
  (`appointment.created`, `message.sent`, unknown, missing) → `200
  {ignored:true}`. No loose prefix matching (`event.startsWith("lead")`) —
  an explicit `Set`.
- **Delivery dedupe**: every inbound delivery is recorded in a new table,
  `integration_webhook_events`, keyed `UNIQUE(provider, delivery_id)`.
  `delivery_id` = `X-Repli-Delivery` header, else a body field, else a hash
  of the raw body — **never** the Repli lead id (a different concept). A
  delivery already `PROCESSED`/`IGNORED` → `200 {duplicate:true}`
  immediately, nothing touched. A race that loses the unique-insert is
  caught and treated as a duplicate, never a `500`.
- **Client resolution**: the Birthwave `client_id` is resolved **server-side**
  from `REPLI_BIRTHWAVE_CLIENT_KEY` (env, value `birthwave`) — a payload
  field is never trusted for this.
- **Phone handling**: `birthwave_leads.phone` is nullable (see §3). A lead is
  only rejected as unusable when it has **neither** a phone **nor** a stable
  Repli lead id (`hasSufficientRepliIdentity`) — a real Repli lead can be
  `status: "completed"` with no phone ever collected, and that alone must
  not drop it.
- Processing (normalize → dedupe → create/enrich → activity → mark
  `PROCESSED`) happens in one DB transaction, then calls the **shared**
  upsert described in §1.3.

### 1.2 Historical sync — `POST /api/v1/integrations/repli/birthwave/sync`

Admin-triggered pull of leads Repli already has, for backfilling / catching
up leads the webhook missed.

**Files:** `repliApi.service.js`, `repliSync.service.js`, `repliSync.controller.js`, `repliApiLeadAdapter.js`

- **Not a webhook** — normal IGT auth (`authenticateManagementToken`:
  `super-admin`/`admin` only), no `X-Repli-Signature`.
- Calls the confirmed Repli endpoint:
  ```
  GET https://zwawkzzkpxnexynhzpdx.supabase.co/functions/v1/public-api/leads?limit=50&platform=instagram
  Authorization: Bearer <REPLI_API_KEY>
  ```
  `REPLI_API_KEY` is a **separate secret** from `REPLI_BIRTHWAVE_WEBHOOK_SECRET`
  — one authenticates IGT calling *out* to Repli, the other authenticates
  Repli calling *in* to IGT.
- Confirmed real response shape:
  ```json
  {
    "leads": [
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
    ]
  }
  ```
  Note there is **no fixed `phone` field** — a valid, completed lead can
  simply never have collected one.
- `repliApiLeadAdapter.js` turns one record into the shape the shared
  normalizer already understands, *without* changing the webhook's
  normalizer semantics:
  - `record.id` → `lead_id` (only this adapter treats a root `id` as the
    lead id — confirmed for this endpoint specifically).
  - `collected_data` is a free-form question→answer map, not fixed field
    names, so `name` / `email` / `phone` / `service` are recovered by
    **case-insensitive substring matching** on the question label (e.g. a
    label containing "email" → email; "phone"/"mobile"/"whatsapp"/"contact
    number" → phone; "service"/"interested in"/"looking for" → service —
    the last one reuses `birthwave_leads.service`, an existing generic
    field, rather than inventing a new column for one questionnaire).
  - Name fallback order: extracted answer → `instagram_username` → (the
    shared upsert's own `"Instagram Lead"` placeholder on create).
  - The whole `collected_data` object is preserved unmodified regardless of
    what was extracted from it.
- Processes each record independently (its own transaction) so one bad
  record doesn't abort the batch; returns
  `{ fetched, created, updated, skipped, failed, paginationHint, failedRecords }`.
  `paginationHint` surfaces any `next`/`cursor`/`total`/etc. field Repli's
  response happens to carry, **without acting on it** — pagination beyond
  `limit=50` is not implemented because it isn't confirmed yet.

### 1.3 Shared normalize + upsert (the part that makes both paths agree)

**Files:** `normalizeRepliBirthwaveLead.js`, `repliBirthwaveShared.service.js`

Both the webhook and the sync funnel into the **same two functions** — there
is exactly one Repli→Birthwave field-mapping implementation and exactly one
CRM lead-dedupe/upsert implementation:

- `normalizeRepliBirthwaveLead(payload)` → `{ name, phone, email, service,
  source, campaign, leadScore, externalLeadId, conversationId, workspaceId,
  agentId, answers, completionState, rootId, rawMetadata }`. Tolerant of
  casing and of `data`/`lead`/`payload` envelope nesting.
- `upsertBirthwaveRepliLead({ client, normalized, phone, transaction,
  metadataExtra })` — CRM lead dedupe, scoped to the Birthwave client, never
  cross-client, never a bare `where:{phone}`:
  1. `client_id + source_provider="REPLI" + source_external_id`
  2. else, only if a phone is actually known: `client_id + phone`
  3. neither → the record is skipped upstream (`hasSufficientRepliIdentity`)

  **Create** → `source:"instagram"`, `source_provider:"REPLI"`,
  `status:"new_lead"`, `phone` possibly `null`.
  **Enrich** (lead already exists) → fills only currently-empty
  `name`/`email`/`phone`/`service`/`source_external_id`, merges
  `integration_metadata` (campaign, score, answers, conversation/workspace/
  agent ids, `collected_data`, sync bookkeeping). **Never** touches
  CRM-managed fields: `status`, assignment, notes, follow-up/appointment
  state, manual custom fields.

This is why the cross-path scenarios work correctly:
- A lead created by `/sync` with no phone gets its phone filled in later by
  a webhook that has one (or vice versa) — same row, not duplicated.
- Running `/sync` twice, or a webhook retry, never creates a second lead —
  `action` comes back `"updated"` after the first `"created"`.
- `lead.created` and `lead.completed` are two distinct webhook deliveries
  (distinct `delivery_id`s, both get their own audit row) but they always
  resolve to the **same** CRM lead.

An activity-timeline entry (`lead_source_activity`) is logged on lead
*creation* only — "Instagram lead received from Repli." /
"Instagram lead details completed in Repli." / "Historical Instagram lead
synced from Repli." — never repeated on a re-sync or retried delivery,
because it runs only after delivery dedupe (webhook) or only on
`action==="created"` (sync).

---

## 2. Backend: making the lead queryable

`GET /api/v1/birthwave/leads` (existing endpoint, extended — not a new one):

- `birthwave.service.js`'s `buildLeadWhere` gained an optional
  `source_provider` filter alongside the existing `source` filter.
- `birthwaveValidation.js`'s `leadListQuery` accepts `source_provider` as a
  free-form string (Repli isn't the only conceivable provider some day).

So `GET /birthwave/leads?source=instagram&source_provider=REPLI` returns a
correctly server-side-filtered, correctly-paginated result — no
fetch-everything-then-filter-in-React, so totals and pagination stay right.

---

## 3. Database changes

| Change | Why |
|---|---|
| New table `integration_webhook_events` (`provider`, `client_id`, `event_type`, `delivery_id`, `status` RECEIVED/PROCESSED/FAILED/IGNORED, `payload` JSON, `error_message`, timestamps; `UNIQUE(provider, delivery_id)`) | Webhook delivery idempotency + audit trail |
| `birthwave_leads.integration_metadata` JSON column | Provider-specific data (campaign, answers, Repli ids, `collected_data`, sync bookkeeping) without polluting the main schema |
| `birthwave_leads.phone` relaxed `NOT NULL` → nullable | A confirmed real Repli lead can have no phone collected — must be representable without fabricating a value |
| Indexes: `(client_id, phone)`, `(client_id, source_external_id)` on `birthwave_leads` | Efficient dedupe lookups |
| `BIRTHWAVE_LEAD_SOURCES` += `"instagram"`; `BIRTHWAVE_ACTIVITY_EVENT_TYPES` += `"lead_source_activity"` | New business source + timeline event type |

All migrations are the repo's idempotent `ensure*` helpers, run from
`connect_mysql()` in `app.js`. No `sync({ alter: true })`; additive/relaxing
only, existing data preserved. Manual lead creation (`POST /birthwave/leads`)
still requires `phone` — only the column-level constraint changed, the Joi
validation on that endpoint didn't.

---

## 4. Frontend: displaying Instagram leads

No new page, no new lead-detail screen, no new API client — the existing
Birthwave Leads list/detail is reused with a fixed server-side filter.

### 4.1 Navigation

Two separate sidebar implementations exist for Birthwave (client login vs.
super-admin login), so the "Instagram Leads" entry had to be added to both:

- `src/layouts/client-portal-layout/navItems.ts` — client-login sidebar
  (`LEADS_CHILDREN`). Inserted between "Website Inquiries" and "Normal
  Birth".
- `src/routes/sitemap.ts` — `birthwaveSitemap`, used by the older generic
  `main-layout` that **super-admin** logins actually render. Same position,
  same `?view=instagram` link.

Both just link to `…/leads?view=instagram` — the same route, same page
component, as every other Leads sub-view (`?view=birthwave_website`, etc.).

### 4.2 Leads page — `src/pages/birthwave/leads/index.tsx`

- `isInstagramView = view === 'instagram'`.
- Query params sent to `useBirthwaveLeadsQuery` are forced to
  `{ source: "instagram", source_provider: "REPLI" }`, overriding any stray
  URL `source` value — the filter is fixed, not just defaulted.
- The "All Sources" dropdown is hidden on this view (nothing to change), and
  the "Add Lead" button is hidden (matches the website-enquiry views).
- Header shows `Instagram Leads (N)` using the backend's own filtered
  `pagination.total` — never a frontend count of the current page.
- An extra "Instagram" column (`@username`, from
  `integration_metadata.instagram_username`) appears only on this view.
- Empty state: "No Instagram leads found. New Birthwave Instagram leads
  captured through Repli will appear here automatically."
- Per-row action button: **"View"**, navigating to the lead-detail page
  (same destination as clicking the row). There is no CRM-lead delete yet
  (only website enquiries support delete today) — a slot is left, commented,
  for adding one later.
- Realtime-ish refresh: `useBirthwaveLeadsQuery` already polls every 15s +
  refetches on window focus, so a lead created by the webhook shows up on an
  open tab without any page action.

### 4.3 Lead detail — `src/pages/birthwave/lead-detail/index.tsx`

Two extra cards, shown only when `lead.source_provider === "REPLI"`:

- **Integration Details** — Source, Provider ("Repli"), Campaign, Instagram
  Username, Repli Status, Repli Created At, Repli Completed At.
- **Collected Details** — every `integration_metadata.collected_data`
  question→answer pair rendered generically (not hardcoded to today's
  questionnaire), so a new Repli question shows up automatically without a
  frontend change.

Both read straight from the lead's existing `integration_metadata` — no new
fields were added to the `BirthwaveLead` type beyond `integration_metadata`
and a nullable `phone`.

### 4.4 Null phone, everywhere

`BirthwaveLead.phone` is `string | null` in the frontend type; every place
that renders it (`leads` list, `lead-detail` header, `follow-ups` list, the
appointment-form lead picker) shows `—` instead of blank/`null`/crashing.

---

## 5. Field mapping (source of truth)

| Repli | Normalized | `birthwave_leads` |
|---|---|---|
| `name`/`full_name`/`username`, or `collected_data` label containing "name" | `name` | `name` (fallback `instagram_username`, then `"Instagram Lead"`) |
| `phone`/`phone_number`/`mobile`/`whatsapp`, or `collected_data` label containing "phone"/"mobile"/"whatsapp"/"contact number" | `phone` → `normalizePhone` | `phone` (nullable) |
| `email`, or `collected_data` label containing "email" | `email` | `email` |
| `collected_data` label containing "service"/"interested in"/"looking for" | `service` | `service` |
| — | `"instagram"` | `source` |
| — | `"REPLI"` | `source_provider` |
| `lead_id`/`external_lead_id`, or (sync only) `record.id` | `externalLeadId` | `source_external_id` |
| `campaign`, `lead_score`, `conversation_id`, `workspace_id`, `agent_id`, `answers`/`collected_data`, `platform`, `instagram_username`, `telegram_username`, Repli `status`, `created_at`/`completed_at` | — | `integration_metadata.*` |

Status is always the model default `new_lead` on creation and is never
touched afterward by either ingestion path.

---

## 6. Environment variables

| Name | Used by | Notes |
|---|---|---|
| `REPLI_BIRTHWAVE_WEBHOOK_ENABLED` | webhook | must be `"true"` to accept deliveries |
| `REPLI_BIRTHWAVE_WEBHOOK_SECRET` | webhook | Repli endpoint Signing Secret (HMAC key) — never logged |
| `REPLI_BIRTHWAVE_CLIENT_KEY` | both | `clients.client_key` every lead maps to (`birthwave`) |
| `REPLI_BIRTHWAVE_WEBHOOK_DEBUG` | webhook | stage/local only — logs headers/body/normalized result, never the secret |
| `REPLI_BIRTHWAVE_WEBHOOK_RATE_LIMIT_MAX` | webhook | optional, default 120/min |
| `REPLI_API_BASE_URL` | sync | Repli REST base URL |
| `REPLI_API_KEY` | sync | IGT→Repli auth — **distinct** from the webhook secret, never exposed to the frontend |
| `REPLI_BIRTHWAVE_SYNC_LIMIT` | sync | optional, default 50 |
| `REPLI_BIRTHWAVE_TEST_URL` | local dev only | ngrok URL for the manual `npm run test:repli:ping` script |

---

## 7. What's been verified vs. what's still manual

**Executed and confirmed working** (against the real Repli API and the live
local database, not just unit tests):
- `syncRepliBirthwaveLeads()` run for real: fetched the live Repli account's
  1 lead, created it correctly (`name`, `email`, `service`, `phone: null`,
  full `integration_metadata`).
- Re-run of the same sync: `created: 0, updated: 1` — confirmed idempotent,
  no duplicate row.
- Backend unit suites (`verifyRepliBirthwaveWebhook.js`,
  `verifyRepliBirthwaveSync.js`): signature verification (valid/tampered/
  wrong-secret/missing), event classification, the exact real API record
  shape, tolerant label-matching for name/email/phone/service, identity
  rules, metadata merge behavior.
- Frontend `tsc --noEmit` clean throughout.
- The Instagram Leads tab, in a real browser, showing the synced lead
  correctly (Source: Instagram, Phone: —, Service: pregnancy care) after
  fixing a nav-registration gap for super-admin logins (`routes/sitemap.ts`
  hadn't been updated alongside `client-portal-layout/navItems.ts`).

**Not yet executed for real:**
- A live `lead.created`/`lead.completed` webhook delivery through ngrok (the
  `test.ping` connectivity check has been run for real; the lead-creating
  events haven't).
- Pagination beyond Repli's `limit=50` — not implemented, deliberately, until
  a real multi-page response confirms the shape.
- CRM lead delete (only website enquiries have delete today).
