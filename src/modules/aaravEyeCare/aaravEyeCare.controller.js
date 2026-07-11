import {
  exportAaravEyeCareLeadReport,
  listAaravEyeCareLeads,
  getAaravEyeCareSummary,
  getAaravEyeCareLeadById,
  createAaravEyeCarePublicLead,
  createAaravEyeCareLead,
  updateAaravEyeCareLead,
  deleteAaravEyeCareLead,
} from "./aaravEyeCare.service.js";

export const getAaravEyeCareLeads = async (req, res, next) => {
  try {
    const result = await listAaravEyeCareLeads(req.query, req.tenant);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
};

export const registerAaravEyeCarePublicLead = async (req, res, next) => {
  try {
    const data = await createAaravEyeCarePublicLead(req.body, req.publicTenantId);
    return res.status(201).json({
      success: true,
      message: "Aarav Eye Care lead created successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const exportAaravEyeCareLeads = async (req, res, next) => {
  try {
    const report = await exportAaravEyeCareLeadReport(req.query, req.tenant);

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

export const getAaravEyeCareSummaryMetrics = async (req, res, next) => {
  try {
    const data = await getAaravEyeCareSummary(req.query, req.tenant);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const getAaravEyeCareLead = async (req, res, next) => {
  try {
    const data = await getAaravEyeCareLeadById(
      req.params.id,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const createAaravEyeCareLeadRecord = async (req, res, next) => {
  try {
    const data = await createAaravEyeCareLead(
      req.body,
      req.tenant,
      req.query._client_key,
    );
    return res.status(201).json({
      success: true,
      message: "Aarav Eye Care lead created successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const updateAaravEyeCareLeadRecord = async (req, res, next) => {
  try {
    const data = await updateAaravEyeCareLead(
      req.params.id,
      req.body,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({
      success: true,
      message: "Aarav Eye Care lead updated successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const deleteAaravEyeCareLeadRecord = async (req, res, next) => {
  try {
    await deleteAaravEyeCareLead(
      req.params.id,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({
      success: true,
      message: "Aarav Eye Care lead deleted successfully",
    });
  } catch (error) {
    return next(error);
  }
};
