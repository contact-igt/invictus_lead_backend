import {
  exportRioLeadReport,
  listRioLeads,
  getRioSummary,
  getRioLeadById,
  createRioLead,
  createRioPublicLead,
  updateRioLead,
  deleteRioLead,
} from "./rio.service.js";

export const registerRioPublicLead = async (req, res, next) => {
  try {
    const data = await createRioPublicLead(req.body, req.publicTenantId);
    return res.status(201).json({
      success: true,
      message: "Rio lead created successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const getRioLeads = async (req, res, next) => {
  try {
    const result = await listRioLeads(req.query, req.tenant);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
};

export const exportRioLeads = async (req, res, next) => {
  try {
    const report = await exportRioLeadReport(req.query, req.tenant);

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

export const getRioSummaryMetrics = async (req, res, next) => {
  try {
    const data = await getRioSummary(req.query, req.tenant);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const getRioLead = async (req, res, next) => {
  try {
    const data = await getRioLeadById(
      req.params.id,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const createRioLeadRecord = async (req, res, next) => {
  try {
    const data = await createRioLead(
      req.body,
      req.tenant,
      req.query._client_key,
    );
    return res.status(201).json({
      success: true,
      message: "Rio lead created successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const updateRioLeadRecord = async (req, res, next) => {
  try {
    const data = await updateRioLead(
      req.params.id,
      req.body,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({
      success: true,
      message: "Rio lead updated successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const deleteRioLeadRecord = async (req, res, next) => {
  try {
    await deleteRioLead(
      req.params.id,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({
      success: true,
      message: "Rio lead deleted successfully",
    });
  } catch (error) {
    return next(error);
  }
};

