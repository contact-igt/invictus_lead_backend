import {
  createPixelEyeWebsiteLead,
  createPixelEyeWebsiteLeadPublicRecord,
  deletePixelEyeWebsiteLead,
  exportPixelEyeWebsiteLeadReport,
  getPixelEyeWebsiteLeadById,
  getPixelEyeWebsiteLeadSummary,
  listPixelEyeWebsiteLeads,
  updatePixelEyeWebsiteLead,
} from "./pixelEyeWebsiteLead.service.js";

export const registerPixelEyeWebsitePublicLead = async (req, res, next) => {
  try {
    const data = await createPixelEyeWebsiteLeadPublicRecord(req.body, req.publicTenantId);
    return res.status(201).json({
      success: true,
      message: "PixelEye Website Lead created successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const getPixelEyeWebsiteLeads = async (req, res, next) => {
  try {
    const result = await listPixelEyeWebsiteLeads(req.query, req.tenant);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
};

export const getPixelEyeWebsiteLeadSummaryMetrics = async (req, res, next) => {
  try {
    const data = await getPixelEyeWebsiteLeadSummary(req.query, req.tenant);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const exportPixelEyeWebsiteLeads = async (req, res, next) => {
  try {
    const report = await exportPixelEyeWebsiteLeadReport(req.query, req.tenant);

    res.setHeader("Content-Type", report.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);

    return res.status(200).send(report.buffer);
  } catch (error) {
    return next(error);
  }
};

export const getPixelEyeWebsiteLead = async (req, res, next) => {
  try {
    const data = await getPixelEyeWebsiteLeadById(
      req.params.id,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const createPixelEyeWebsiteLeadRecord = async (req, res, next) => {
  try {
    const data = await createPixelEyeWebsiteLead(
      req.body,
      req.tenant,
      req.query._client_key,
    );
    return res.status(201).json({
      success: true,
      message: "PixelEye Website Lead created successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const updatePixelEyeWebsiteLeadRecord = async (req, res, next) => {
  try {
    const data = await updatePixelEyeWebsiteLead(
      req.params.id,
      req.body,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({
      success: true,
      message: "PixelEye Website Lead updated successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const deletePixelEyeWebsiteLeadRecord = async (req, res, next) => {
  try {
    await deletePixelEyeWebsiteLead(
      req.params.id,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({
      success: true,
      message: "PixelEye Website Lead deleted successfully",
    });
  } catch (error) {
    return next(error);
  }
};
