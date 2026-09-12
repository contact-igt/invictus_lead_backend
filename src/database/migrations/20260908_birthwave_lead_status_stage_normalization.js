// BW-FIX-002: normalizes existing birthwave_leads.status values that were
// stored in the older 6-value legacy vocabulary (new_lead, assigned,
// contacted, consultation_booked, visited, converted) to their canonical
// BIRTHWAVE_LEAD_STAGES equivalent (NEW, ASSIGNED, CONTACTED,
// APPOINTMENT_SCHEDULED, ATTENDED, CONVERTED). Application code as of this
// migration always writes the stage form (see birthwave.service.js,
// birthwaveAssignment.service.js, birthwaveWebsiteLead.service.js); this is
// a one-time data backfill so no row is left in the old, now-unwritten
// vocabulary. Values outside this 6-item map (e.g. LOST, INVALID,
// CONTACTING, QUALIFIED, INTERESTED — stages with no legacy equivalent) are
// already in canonical form and are left untouched.
const LEADS = "birthwave_leads";

const LEGACY_TO_STAGE = {
  new_lead: "NEW",
  assigned: "ASSIGNED",
  contacted: "CONTACTED",
  consultation_booked: "APPOINTMENT_SCHEDULED",
  visited: "ATTENDED",
  converted: "CONVERTED",
};

export const name = "20260908_birthwave_lead_status_stage_normalization";

export async function up({ context: qi }) {
  for (const [legacy, stage] of Object.entries(LEGACY_TO_STAGE)) {
    await qi.bulkUpdate(LEADS, { status: stage }, { status: legacy });
  }
}

export async function down({ context: qi }) {
  // Best-effort reversal only: this converts every row currently holding a
  // stage value back to its legacy equivalent. It cannot distinguish a row
  // this migration originally touched from a row that legitimately reached
  // that same stage afterward through normal application use (e.g. a lead
  // assigned after this migration ran) — both would be reverted. Acceptable
  // for an emergency rollback of this specific migration, not for routine use.
  for (const [legacy, stage] of Object.entries(LEGACY_TO_STAGE)) {
    await qi.bulkUpdate(LEADS, { status: legacy }, { status: stage });
  }
}

export default { name, up, down };
