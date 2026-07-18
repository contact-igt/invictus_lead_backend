import {
  exportShantiEyeTechLeadReport,
  listShantiEyeTechLeads,
  getShantiEyeTechSummary,
  getShantiEyeTechLeadById,
  createShantiEyeTechPublicLead,
  createShantiEyeTechLead,
  updateShantiEyeTechLead,
  deleteShantiEyeTechLead,
} from "./shantiEyeTech.service.js";

export const getShantiEyeTechLeads = async (req, res, next) => {
  try {
    const result = await listShantiEyeTechLeads(req.query, req.tenant);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
};

export const registerShantiEyeTechPublicLead = async (req, res, next) => {
  try {
    const data = await createShantiEyeTechPublicLead(
      req.body,
      req.publicTenantId,
    );
    return res.status(201).json({
      success: true,
      message: "Shanti Eye Tech lead created successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const exportShantiEyeTechLeads = async (req, res, next) => {
  try {
    const report = await exportShantiEyeTechLeadReport(req.query, req.tenant);
    res.setHeader("Content-Type", report.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${report.filename}"`,
    );
    return res.status(200).send(report.buffer);
  } catch (error) {
    return next(error);
  }
};

export const getShantiEyeTechSummaryMetrics = async (req, res, next) => {
  try {
    const data = await getShantiEyeTechSummary(req.query, req.tenant);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const getShantiEyeTechLead = async (req, res, next) => {
  try {
    const data = await getShantiEyeTechLeadById(
      req.params.id,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const createShantiEyeTechLeadRecord = async (req, res, next) => {
  try {
    const data = await createShantiEyeTechLead(
      req.body,
      req.tenant,
      req.query._client_key,
    );
    return res.status(201).json({
      success: true,
      message: "Shanti Eye Tech lead created successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const updateShantiEyeTechLeadRecord = async (req, res, next) => {
  try {
    const data = await updateShantiEyeTechLead(
      req.params.id,
      req.body,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({
      success: true,
      message: "Shanti Eye Tech lead updated successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const deleteShantiEyeTechLeadRecord = async (req, res, next) => {
  try {
    await deleteShantiEyeTechLead(
      req.params.id,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({
      success: true,
      message: "Shanti Eye Tech lead deleted successfully",
    });
  } catch (error) {
    return next(error);
  }
};
