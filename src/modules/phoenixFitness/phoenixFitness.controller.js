import {
  exportPhoenixFitnessLeadReport,
  listPhoenixFitnessLeads,
  getPhoenixFitnessSummary,
  getPhoenixFitnessLeadById,
  createPhoenixFitnessPublicLead,
  createPhoenixFitnessLead,
  updatePhoenixFitnessLead,
  deletePhoenixFitnessLead,
} from "./phoenixFitness.service.js";

export const getPhoenixFitnessLeads = async (req, res, next) => {
  try {
    const result = await listPhoenixFitnessLeads(req.query, req.tenant);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
};

export const registerPhoenixFitnessPublicLead = async (req, res, next) => {
  try {
    const data = await createPhoenixFitnessPublicLead(
      req.body,
      req.publicTenantId,
    );
    return res.status(201).json({
      success: true,
      message: "Phoenix Fitness lead created successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const exportPhoenixFitnessLeads = async (req, res, next) => {
  try {
    const report = await exportPhoenixFitnessLeadReport(req.query, req.tenant);
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

export const getPhoenixFitnessSummaryMetrics = async (req, res, next) => {
  try {
    const data = await getPhoenixFitnessSummary(req.query, req.tenant);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const getPhoenixFitnessLead = async (req, res, next) => {
  try {
    const data = await getPhoenixFitnessLeadById(
      req.params.id,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const createPhoenixFitnessLeadRecord = async (req, res, next) => {
  try {
    const data = await createPhoenixFitnessLead(
      req.body,
      req.tenant,
      req.query._client_key,
    );
    return res.status(201).json({
      success: true,
      message: "Phoenix Fitness lead created successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const updatePhoenixFitnessLeadRecord = async (req, res, next) => {
  try {
    const data = await updatePhoenixFitnessLead(
      req.params.id,
      req.body,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({
      success: true,
      message: "Phoenix Fitness lead updated successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const deletePhoenixFitnessLeadRecord = async (req, res, next) => {
  try {
    await deletePhoenixFitnessLead(
      req.params.id,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({
      success: true,
      message: "Phoenix Fitness lead deleted successfully",
    });
  } catch (error) {
    return next(error);
  }
};
