import {
  createVlsBusinessLawRegistration,
  createVlsBusinessLawPublicRegistration,
  deleteVlsBusinessLawRegistration,
  exportVlsBusinessLawReport,
  getVlsBusinessLawRegistrationById,
  getVlsBusinessLawSummary,
  listVlsBusinessLawRegistrations,
  updateVlsBusinessLawRegistration,
} from "./vlsBusinessLaw.service.js";

export const registerVlsBusinessLawPublicLead = async (req, res, next) => {
  try {
    const data = await createVlsBusinessLawPublicRegistration(req.body, req.publicTenantId);
    return res.status(201).json({
      success: true,
      message: "Business Law registration created successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const getVlsBusinessLawRegistrations = async (req, res, next) => {
  try {
    const result = await listVlsBusinessLawRegistrations(req.query, req.tenant);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
};

export const getVlsBusinessLawSummaryMetrics = async (req, res, next) => {
  try {
    const data = await getVlsBusinessLawSummary(req.query, req.tenant);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const exportVlsBusinessLawRegistrations = async (req, res, next) => {
  try {
    const report = await exportVlsBusinessLawReport(req.query, req.tenant);
    res.setHeader("Content-Type", report.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);
    return res.status(200).send(report.buffer);
  } catch (error) {
    return next(error);
  }
};

export const getVlsBusinessLawRegistration = async (req, res, next) => {
  try {
    const data = await getVlsBusinessLawRegistrationById(
      req.params.id,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const createVlsBusinessLawRegistrationRecord = async (req, res, next) => {
  try {
    const data = await createVlsBusinessLawRegistration(
      req.body,
      req.tenant,
      req.query._client_key,
    );
    return res.status(201).json({
      success: true,
      message: "Business Law registration created successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const updateVlsBusinessLawRegistrationRecord = async (req, res, next) => {
  try {
    const data = await updateVlsBusinessLawRegistration(
      req.params.id,
      req.body,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({
      success: true,
      message: "Business Law registration updated successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const deleteVlsBusinessLawRegistrationRecord = async (req, res, next) => {
  try {
    await deleteVlsBusinessLawRegistration(
      req.params.id,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({
      success: true,
      message: "Business Law registration deleted successfully",
    });
  } catch (error) {
    return next(error);
  }
};
