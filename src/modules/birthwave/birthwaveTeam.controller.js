import {
  addTeamMember,
  createTeam,
  getMyTeamMemberships,
  getTeam,
  listTeamMembers,
  listManagementCandidates,
  listTeams,
  updateTeam,
  updateTeamMember,
} from "./birthwaveTeam.service.js";
import {
  createAssignmentRule,
  listAssignmentRules,
  updateAssignmentRule,
} from "./birthwaveAssignment.service.js";

export const listTeamsHandler = async (req, res, next) => {
  try { return res.status(200).json({ success: true, data: await listTeams(req.tenant, req.query, req.user) }); } catch (error) { return next(error); }
};
export const createTeamHandler = async (req, res, next) => {
  try { return res.status(201).json({ success: true, data: await createTeam(req.tenant, req.body, req.user) }); } catch (error) { return next(error); }
};
export const getTeamHandler = async (req, res, next) => {
  try { return res.status(200).json({ success: true, data: await getTeam(req.tenant, req.params.id, req.user) }); } catch (error) { return next(error); }
};
export const updateTeamHandler = async (req, res, next) => {
  try { return res.status(200).json({ success: true, data: await updateTeam(req.tenant, req.params.id, req.body, req.user) }); } catch (error) { return next(error); }
};
export const listTeamMembersHandler = async (req, res, next) => {
  try { return res.status(200).json({ success: true, data: await listTeamMembers(req.tenant, req.params.id, req.user) }); } catch (error) { return next(error); }
};
export const addTeamMemberHandler = async (req, res, next) => {
  try { return res.status(201).json({ success: true, data: await addTeamMember(req.tenant, req.params.id, req.body, req.user) }); } catch (error) { return next(error); }
};
export const updateTeamMemberHandler = async (req, res, next) => {
  try { return res.status(200).json({ success: true, data: await updateTeamMember(req.tenant, req.params.id, req.params.memberId, req.body, req.user) }); } catch (error) { return next(error); }
};
export const getMyTeamMembershipsHandler = async (req, res, next) => {
  try { return res.status(200).json({ success: true, data: await getMyTeamMemberships(req.tenant, req.user) }); } catch (error) { return next(error); }
};
export const listManagementCandidatesHandler = async (req, res, next) => {
  try { return res.status(200).json({ success: true, data: await listManagementCandidates(req.tenant, req.user) }); } catch (error) { return next(error); }
};
export const listAssignmentRulesHandler = async (req, res, next) => {
  try { return res.status(200).json({ success: true, data: await listAssignmentRules(req.tenant, req.user) }); } catch (error) { return next(error); }
};
export const createAssignmentRuleHandler = async (req, res, next) => {
  try { return res.status(201).json({ success: true, data: await createAssignmentRule(req.tenant, req.body, req.user) }); } catch (error) { return next(error); }
};
export const updateAssignmentRuleHandler = async (req, res, next) => {
  try { return res.status(200).json({ success: true, data: await updateAssignmentRule(req.tenant, req.params.id, req.body, req.user) }); } catch (error) { return next(error); }
};
