import db from "../../database/index.js";

/**
 * Append a single row to a lead's activity timeline. Never throws into the
 * caller's request path — timeline logging is best-effort.
 */
export const logBirthwaveActivity = async ({
  clientId,
  leadId,
  actor,
  eventType,
  title,
  description = null,
  previousValue = null,
  newValue = null,
}) => {
  try {
    await db.BirthwaveLeadActivity.create({
      client_id: clientId,
      lead_id: leadId,
      actor_user_id: actor?.id ?? null,
      actor_name: actor?.username ?? actor?.name ?? null,
      event_type: eventType,
      title,
      description,
      previous_value: previousValue == null ? null : String(previousValue),
      new_value: newValue == null ? null : String(newValue),
      occurred_at: new Date(),
    });
  } catch (error) {
    console.error("[Birthwave] Failed to log lead activity", {
      leadId,
      eventType,
      message: error?.message,
    });
  }
};

export const getLeadTimeline = async (clientId, leadId) => {
  const rows = await db.BirthwaveLeadActivity.findAll({
    where: { client_id: clientId, lead_id: leadId },
    order: [
      ["occurred_at", "DESC"],
      ["id", "DESC"],
    ],
  });

  return rows.map((row) => ({
    id: row.id,
    lead_id: row.lead_id,
    actor_user_id: row.actor_user_id,
    actor_name: row.actor_name,
    event_type: row.event_type,
    title: row.title,
    description: row.description,
    previous_value: row.previous_value,
    new_value: row.new_value,
    occurred_at: row.occurred_at,
  }));
};
