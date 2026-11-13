import db from "../../database/index.js";
import { attemptPhoenixFitnessSheetSync } from "./phoenixFitnessSheetSync.service.js";

// Only this public website path queues Runo; existing landing-page/admin intake is unchanged.
export const createPhoenixFitnessWebsiteLead = async ({ formType, data, requestId }, clientId, options = {}) => {
  const [record, created] = await db.PhoenixFitness.findOrCreate({
    where: { client_id: clientId, website_request_id: requestId },
    defaults: {
      client_id: clientId, website_request_id: requestId,
      name: data.name, mobile_number: data.phone || data.mobile,
      branch: data.branch || null, utm_source: data.utm_source || "website",
      source_provider: "phoenix_website", form_type: formType, website_data: data,
      sheet_sync_status: "pending", runo_sync_status: "pending",
    },
  });
  // The database is the acceptance boundary; a downstream outage never loses the enquiry.
  if (created && !options.skipDelivery) {
    attemptPhoenixFitnessSheetSync(record).catch(() => console.error("[Phoenix Website] Delivery deferred", { leadId: record.id }));
  }
  return { id: record.id, duplicate: !created };
};
