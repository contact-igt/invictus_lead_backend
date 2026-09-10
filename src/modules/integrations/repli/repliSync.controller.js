import { syncRepliBirthwaveLeads } from "./repliSync.service.js";
import { RepliApiError } from "./repliApi.service.js";

/**
 * POST /api/v1/integrations/repli/birthwave/sync — admin-triggered historical
 * lead import. This is a normal authenticated IGT API route (see
 * repliWebhook.routes.js for the auth chain), NOT a webhook: no
 * X-Repli-Signature, no REPLI_BIRTHWAVE_WEBHOOK_SECRET involved.
 */
export const handleRepliBirthwaveSync = async (req, res) => {
  try {
    const rawLimit = req.body?.limit ?? req.query?.limit;
    const limit = rawLimit !== undefined ? Number(rawLimit) : undefined;

    const result = await syncRepliBirthwaveLeads({
      limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    });

    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    if (err instanceof RepliApiError) {
      console.error(`[Repli][Birthwave][sync] API error: ${err.message}`);
      return res.status(err.status >= 500 ? 502 : err.status).json({
        success: false,
        message: "Unable to fetch Repli leads",
      });
    }

    console.error(`[Repli][Birthwave][sync] failed: ${err?.message}`);
    return res.status(err?.status || 500).json({
      success: false,
      message: "Repli sync failed",
    });
  }
};

export default handleRepliBirthwaveSync;
