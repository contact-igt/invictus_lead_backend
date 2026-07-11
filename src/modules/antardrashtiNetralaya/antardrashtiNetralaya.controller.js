import {
  exportAntardrashtiNetralayaLeadReport,
  listAntardrashtiNetralayaLeads,
  getAntardrashtiNetralayaSummary,
  getAntardrashtiNetralayaLeadById,
  createAntardrashtiNetralayaLead,
  createAntardrashtiNetralayaPublicLead,
  updateAntardrashtiNetralayaLead,
  deleteAntardrashtiNetralayaLead,
} from "./antardrashtiNetralaya.service.js";

export const registerAntardrashtiNetralayaPublicLead = async (req, res, next) => {
  try {
    const data = await createAntardrashtiNetralayaPublicLead(req.body, req.publicTenantId);
    return res.status(201).json({
      success: true,
      message: "Antardrashti Netralaya lead created successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const getAntardrashtiNetralayaLeads = async (req, res, next) => {
  try {
    const result = await listAntardrashtiNetralayaLeads(req.query, req.tenant);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
};

export const exportAntardrashtiNetralayaLeads = async (req, res, next) => {
  try {
    const report = await exportAntardrashtiNetralayaLeadReport(req.query, req.tenant);

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

export const getAntardrashtiNetralayaSummaryMetrics = async (req, res, next) => {
  try {
    const data = await getAntardrashtiNetralayaSummary(req.query, req.tenant);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const getAntardrashtiNetralayaLead = async (req, res, next) => {
  try {
    const data = await getAntardrashtiNetralayaLeadById(
      req.params.id,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const createAntardrashtiNetralayaLeadRecord = async (req, res, next) => {
  try {
    const data = await createAntardrashtiNetralayaLead(
      req.body,
      req.tenant,
      req.query._client_key,
    );
    return res.status(201).json({
      success: true,
      message: "Antardrashti Netralaya lead created successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const updateAntardrashtiNetralayaLeadRecord = async (req, res, next) => {
  try {
    const data = await updateAntardrashtiNetralayaLead(
      req.params.id,
      req.body,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({
      success: true,
      message: "Antardrashti Netralaya lead updated successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const deleteAntardrashtiNetralayaLeadRecord = async (req, res, next) => {
  try {
    await deleteAntardrashtiNetralayaLead(
      req.params.id,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({
      success: true,
      message: "Antardrashti Netralaya lead deleted successfully",
    });
  } catch (error) {
    return next(error);
  }
};

