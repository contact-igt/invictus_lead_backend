import { recordTaskOutcome } from "./birthwaveOutcome.service.js";

export const recordTaskOutcomeHandler = async (req, res, next) => {
  try { return res.status(200).json({ success: true, data: await recordTaskOutcome(req.tenant, req.params.id, req.body, req.user) }); } catch (error) { return next(error); }
};
