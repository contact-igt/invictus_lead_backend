import { assignLead, bulkAssignLeads, listAssignments, routeLeadByRules } from "./birthwaveAssignment.service.js";

export const assignLeadHandler = async (req, res, next) => {
  try {
    const data = await assignLead({ tenant: req.tenant, leadId: req.params.id, teamId: req.body.team_id, ownerId: req.body.owner_id, reason: req.body.reason, actor: req.user });
    return res.status(200).json({ success: true, message: "Lead assigned", data: data.serialized });
  } catch (error) { return next(error); }
};

export const bulkAssignLeadsHandler = async (req, res, next) => {
  try {
    const data = await bulkAssignLeads({ tenant: req.tenant, leadIds: req.body.lead_ids, teamId: req.body.team_id, ownerId: req.body.owner_id, reason: req.body.reason, actor: req.user });
    return res.status(data.failed_count ? 207 : 200).json({ success: data.failed_count === 0, ...data });
  } catch (error) { return next(error); }
};

export const routeLeadHandler = async (req, res, next) => {
  try {
    const data = await routeLeadByRules({ tenant: req.tenant, leadId: req.params.id, actor: req.user });
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};

export const listLeadAssignmentsHandler = async (req, res, next) => {
  try {
    const data = await listAssignments(req.tenant, req.params.id, req.user);
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};
