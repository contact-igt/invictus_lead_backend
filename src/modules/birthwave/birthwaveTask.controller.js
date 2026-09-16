import { cancelTask, completeTask, createManualTask, getTaskById, listTasks, rescheduleTask, startTask } from "./birthwaveTask.service.js";

export const listTasksHandler = async (req, res, next) => {
  try { return res.status(200).json(await listTasks(req.tenant, req.query, req.user)); } catch (error) { return next(error); }
};
export const getTaskHandler = async (req, res, next) => {
  try { return res.status(200).json({ success: true, data: await getTaskById(req.tenant, req.params.id, req.user) }); } catch (error) { return next(error); }
};
export const createTaskHandler = async (req, res, next) => {
  try { return res.status(201).json({ success: true, data: await createManualTask(req.tenant, req.body, req.user) }); } catch (error) { return next(error); }
};
export const startTaskHandler = async (req, res, next) => {
  try { return res.status(200).json({ success: true, data: await startTask(req.tenant, req.params.id, req.user) }); } catch (error) { return next(error); }
};
export const completeTaskHandler = async (req, res, next) => {
  try { return res.status(200).json({ success: true, data: await completeTask(req.tenant, req.params.id, req.body, req.user) }); } catch (error) { return next(error); }
};
export const rescheduleTaskHandler = async (req, res, next) => {
  try { return res.status(200).json({ success: true, data: await rescheduleTask(req.tenant, req.params.id, req.body, req.user) }); } catch (error) { return next(error); }
};
export const cancelTaskHandler = async (req, res, next) => {
  try { return res.status(200).json({ success: true, data: await cancelTask(req.tenant, req.params.id, req.body, req.user) }); } catch (error) { return next(error); }
};
