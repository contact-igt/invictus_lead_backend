import db from "../../database/index.js";
import { isTenantAdmin } from "./birthwavePermissions.service.js";

const httpError = (status, message) => Object.assign(new Error(message), { status });

export const deleteLead = async (tenant, id, actor) => {
  if (!tenant?.id) throw httpError(403, "A valid client context is required");
  if (!isTenantAdmin(actor)) throw httpError(403, "Only Birthwave administrators can delete leads");

  return db.sequelize.transaction(async (transaction) => {
    const lead = await db.BirthwaveLead.findOne({
      where: { client_id: tenant.id, id }, transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!lead) throw httpError(404, "Lead not found");
    const options = { where: { client_id: tenant.id, lead_id: lead.id }, transaction };

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
      where: { client_id: tenant.id, birthwave_lead_id: lead.id }, transaction,
    });
    await db.CrmCall.update({ lead_id: null }, options);
    await lead.destroy({ transaction });
    return { id: lead.id };
  });
};
