import { getMyWork, getTeamWork } from "./birthwaveWork.service.js";

export const getMyWorkHandler = async (req, res, next) => {
  try { return res.status(200).json({ success: true, data: await getMyWork(req.tenant, req.query, req.user) }); } catch (error) { return next(error); }
};

export const getTeamWorkHandler = async (req, res, next) => {
  try { return res.status(200).json({ success: true, data: await getTeamWork(req.tenant, req.query, req.user) }); } catch (error) { return next(error); }
};
