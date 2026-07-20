import { getApiLog, getApiLogSummary, listApiLogs } from "./apiLogs.service.js";

export const listApiLogsHandler = async (req, res, next) => {
  try {
    return res.json({ success: true, ...(await listApiLogs(req.query)) });
  } catch (error) {
    return next(error);
  }
};

export const getApiLogHandler = async (req, res, next) => {
  try {
    const data = await getApiLog(req.params.id);
    if (!data) return res.status(404).json({ message: "API log not found" });
    return res.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const getApiLogSummaryHandler = async (req, res, next) => {
  try {
    return res.json({ success: true, data: await getApiLogSummary(req.query) });
  } catch (error) {
    return next(error);
  }
};
