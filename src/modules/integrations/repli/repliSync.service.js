import db from "../../../database/index.js";
import { normalizePhone } from "../../birthwave/birthwaveWebsiteLead.service.js";
import { logBirthwaveActivity } from "../../birthwave/birthwaveActivity.service.js";
import { normalizeRepliBirthwaveLead } from "./normalizeRepliBirthwaveLead.js";
import { adaptRepliApiLeadRecord } from "./repliApiLeadAdapter.js";
import {
  resolveRepliBirthwaveClient,
  upsertBirthwaveRepliLead,
  hasSufficientRepliIdentity,
} from "./repliBirthwaveShared.service.js";
import {
  fetchRepliLeads,
  extractRepliLeadList,
  extractRepliPaginationHint,
  RepliApiError,
} from "./repliApi.service.js";

const createError = (message, status = 500) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const recordExternalId = (record, normalized) =>
  normalized?.externalLeadId ||
  (record && typeof record === "object" ? (record.id != null ? String(record.id) : null) : null);

/**
 * Historical Repli → Birthwave lead sync (admin-triggered).
 *
 * Fetches Repli's confirmed `GET /leads?limit=&platform=instagram`, adapts
 * each record (`adaptRepliApiLeadRecord`) into the shape the SAME normalizer
 * (`normalizeRepliBirthwaveLead`) and SAME upsert (`upsertBirthwaveRepliLead`)
 * the live webhook uses expect — so a lead already created by the webhook is
 * enriched, not duplicated, and re-running the sync is idempotent.
 *
 * A confirmed Repli `/leads` record can have NO phone collected; per
 * `hasSufficientRepliIdentity`, the record is only skipped when it has
 * neither a phone nor a stable Repli lead id (`source_external_id`) — never
 * skipped for a missing phone alone.
 *
 * Per-record errors are caught individually so one bad record does not abort
 * the batch; the caller gets a summary + a capped list of failures.
 */
export const syncRepliBirthwaveLeads = async ({ limit } = {}) => {
  const client = await resolveRepliBirthwaveClient();
  if (!client) {
    throw createError(
      `Birthwave client not found for client_key=${process.env.REPLI_BIRTHWAVE_CLIENT_KEY || "birthwave"}`,
      500,
    );
  }

  const json = await fetchRepliLeads({ limit });
  const records = extractRepliLeadList(json);
  const paginationHint = extractRepliPaginationHint(json);

  const summary = { fetched: records.length, created: 0, updated: 0, skipped: 0, failed: 0 };
  const failedRecords = [];

  for (const record of records) {
    let normalized;
    try {
      normalized = normalizeRepliBirthwaveLead(adaptRepliApiLeadRecord(record));
    } catch (err) {
      summary.failed += 1;
      failedRecords.push({ externalId: recordExternalId(record, null), reason: "normalize_error" });
      console.error(`[Repli][Birthwave][sync] failed to normalize record: ${err?.message}`);
      continue;
    }

    const rawPhone = normalized.phone ? normalizePhone(normalized.phone) : null;
    const phone = rawPhone && rawPhone.replace(/\D/g, "").length >= 7 ? rawPhone : null;

    // A confirmed Repli lead id is sufficient identity on its own — a
    // completed Repli lead with no phone collected is still a valid,
    // storable Birthwave lead. Only skip when neither identity exists.
    if (!hasSufficientRepliIdentity(normalized, phone)) {
      summary.skipped += 1;
      failedRecords.push({
        externalId: recordExternalId(record, normalized),
        reason: "insufficient_identity",
      });
      continue;
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      const { action, lead } = await db.sequelize.transaction((transaction) =>
        upsertBirthwaveRepliLead({
          client,
          normalized,
          phone,
          transaction,
          metadataExtra: {
            sync_source: "api",
            sync_type: "historical",
            synced_at: new Date().toISOString(),
            platform: record?.platform ?? null,
            instagram_username: record?.instagram_username ?? null,
            telegram_username: record?.telegram_username ?? null,
            repli_status: record?.status ?? null,
            repli_created_at: record?.created_at ?? null,
            repli_completed_at: record?.completed_at ?? null,
            // Preserved verbatim even though name/email/phone were already
            // extracted from it — nothing collected is discarded.
            collected_data:
              record?.collected_data && typeof record.collected_data === "object"
                ? record.collected_data
                : {},
          },
        }),
      );

      if (action === "created") {
        summary.created += 1;
        // Only on first creation — a re-run enriching the same lead must not
        // flood the timeline with a repeated entry.
        // eslint-disable-next-line no-await-in-loop
        await logBirthwaveActivity({
          clientId: client.id,
          leadId: lead.id,
          eventType: "lead_source_activity",
          title: "Historical Instagram lead synced from Repli.",
          description: normalized.campaign ? `Campaign: ${normalized.campaign}` : null,
        });
      } else {
        summary.updated += 1;
      }
    } catch (err) {
      summary.failed += 1;
      failedRecords.push({
        externalId: recordExternalId(record, normalized),
        reason: err?.message || "processing_error",
      });
      console.error(`[Repli][Birthwave][sync] record failed: ${err?.message}`);
    }
  }

  return {
    ...summary,
    paginationHint,
    failedRecords: failedRecords.slice(0, 20),
  };
};

export { RepliApiError };
export default syncRepliBirthwaveLeads;
