import assert from "node:assert/strict";
import { Op } from "sequelize";
import db from "../database/index.js";
import { LEGACY_STATUS_TO_STAGE } from "../database/tables/BirthwaveLeadTable/index.js";
import { repairAssignedLeadTask } from "../modules/birthwave/birthwaveTask.service.js";

const serverLine = process.env.INVICTUS_SERVER_LINE || "local";
const apply = process.argv.includes("--apply");
if (apply && !["local", "development"].includes(serverLine) && process.env.ALLOW_BIRTHWAVE_ASSIGNED_TASK_REPAIR !== "true") {
  throw new Error("Assigned Lead repair is restricted to local/development unless ALLOW_BIRTHWAVE_ASSIGNED_TASK_REPAIR=true");
}

const stageFor = (value) => LEGACY_STATUS_TO_STAGE[value] || String(value || "").toUpperCase();
const activeStatuses = ["PENDING", "IN_PROGRESS", "OVERDUE"];
const result = {
  mode: apply ? "apply" : "dry_run",
  total_assigned: 0,
  missing_primary_task: 0,
  eligible_for_repair: 0,
  invalid_owner: 0,
  invalid_team: 0,
  already_has_task: 0,
  conflicts: 0,
  repaired: 0,
  errors: [],
};

const listAccess = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
  return [];
};

const clients = await db.Client.findAll({ attributes: ["id"], order: [["id", "ASC"]] });
const actor = { id: null, role: "client", username: "Assigned Lead Repair" };
try {
  for (const client of clients) {
    const leads = await db.BirthwaveLead.findAll({ where: { client_id: client.id, current_team_id: { [Op.ne]: null }, current_owner_id: { [Op.ne]: null } }, order: [["id", "ASC"]] });
    for (const lead of leads) {
      if (stageFor(lead.status) !== "ASSIGNED") continue;
      result.total_assigned += 1;
      const primary = await db.BirthwaveTask.findOne({ where: { client_id: client.id, lead_id: lead.id, is_primary: true, status: { [Op.in]: activeStatuses } }, attributes: ["id"] });
      if (primary) { result.already_has_task += 1; continue; }
      result.missing_primary_task += 1;
      const team = await db.BirthwaveTeam.findOne({ where: { client_id: client.id, id: lead.current_team_id } });
      if (!team || !team.is_active) { result.invalid_team += 1; continue; }
      const member = await db.BirthwaveTeamMember.findOne({ where: { client_id: client.id, team_id: team.id, management_id: lead.current_owner_id }, include: [{ model: db.Management, as: "management", required: true }] });
      const serviceAccess = listAccess(member?.service_access);
      const sourceAccess = listAccess(member?.source_access);
      const eligible = member && member.status === "ACTIVE" && member.assignment_enabled && ["TEAM_MANAGER", "TELECALLER"].includes(member.operational_role) && (!serviceAccess.length || serviceAccess.includes(lead.service)) && (!sourceAccess.length || sourceAccess.includes(lead.source));
      if (!eligible) { result.invalid_owner += 1; continue; }
      result.eligible_for_repair += 1;
      if (!apply) continue;
      try {
        const transaction = await db.sequelize.transaction();
        try {
          const repaired = await repairAssignedLeadTask({ clientId: client.id, leadId: lead.id, actor, transaction });
          await transaction.commit();
          if (repaired.created) result.repaired += 1;
          else result.conflicts += 1;
        } catch (error) {
          await transaction.rollback();
          result.errors.push({ client_id: client.id, lead_id: lead.id, message: error.message });
        }
      } catch (error) {
        result.errors.push({ client_id: client.id, lead_id: lead.id, message: error.message });
      }
    }
  }
  assert.equal(result.errors.length, 0, result.errors.map((error) => `${error.client_id}/${error.lead_id}: ${error.message}`).join("; "));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await db.sequelize.close();
}
