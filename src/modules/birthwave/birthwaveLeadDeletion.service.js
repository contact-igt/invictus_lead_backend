import db from "../../database/index.js";
import { isTenantAdmin } from "./birthwavePermissions.service.js";

const httpError = (status, message) => Object.assign(new Error(message), { status });

const deleteLeads = async (tenant, ids, actor, requireMatch = false) => {
  if (!tenant?.id) throw httpError(403, "A valid client context is required");
  if (!isTenantAdmin(actor)) throw httpError(403, "Only Birthwave administrators can delete leads");

  return db.sequelize.transaction(async (transaction) => {
    const leads = await db.BirthwaveLead.findAll({
      attributes: ["id"], where: { client_id: tenant.id, id: ids },
      order: [["id", "ASC"]], transaction, lock: transaction.LOCK.UPDATE,
    });
    const matchedIds = leads.map((lead) => lead.id);
    if (requireMatch && !matchedIds.length) throw httpError(404, "Lead not found");
    if (!matchedIds.length) return { deleted_ids: [], failed_ids: ids };
    const options = { where: { client_id: tenant.id, lead_id: matchedIds }, transaction };

    // Delete dependants before their referenced tasks and appointments.
    await db.BirthwaveAttentionItem.destroy(options);
    await db.BirthwaveDisposition.destroy(options);
    await db.BirthwaveLeadActivity.destroy(options);
    await db.BirthwaveLeadAssignment.destroy(options);
    await db.BirthwaveTask.update({ parent_task_id: null }, options);
    await db.BirthwaveTask.destroy(options);
    await db.BirthwaveAppointment.destroy(options);

    // Preserve original intake and external call records, removing their CRM link.
    await db.BirthwaveWebsiteLead.update({ birthwave_lead_id: null }, {
      where: { client_id: tenant.id, birthwave_lead_id: matchedIds }, transaction,
    });
    await db.CrmCall.update({ lead_id: null }, options);
    await db.BirthwaveLead.destroy({ where: { client_id: tenant.id, id: matchedIds }, transaction });
    const matched = new Set(matchedIds.map(Number));
    return { deleted_ids: matchedIds, failed_ids: ids.filter((id) => !matched.has(Number(id))) };
  });
};

export const deleteLead = async (tenant, id, actor) => {
  const { deleted_ids } = await deleteLeads(tenant, [id], actor, true);
  return { id: deleted_ids[0] };
};

export const bulkDeleteLeads = (tenant, ids, actor) => deleteLeads(tenant, [...new Set(ids)], actor);
