import {
  createVlsTaxationLawRegistration,
  createVlsTaxationLawPublicRegistration,
  deleteVlsTaxationLawRegistration,
  exportVlsTaxationLawReport,
  getVlsTaxationLawRegistrationById,
  getVlsTaxationLawSummary,
  listVlsTaxationLawRegistrations,
  updateVlsTaxationLawRegistration,
} from "./vlsTaxationLaw.service.js";

export const registerVlsTaxationLawPublicLead = async (req, res, next) => {
  try {
    const data = await createVlsTaxationLawPublicRegistration(req.body, req.publicTenantId);
    return res.status(201).json({
      success: true,
      message: "Taxation Law registration created successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const getVlsTaxationLawRegistrations = async (req, res, next) => {
  try {
    const result = await listVlsTaxationLawRegistrations(req.query, req.tenant);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
};

export const getVlsTaxationLawSummaryMetrics = async (req, res, next) => {
  try {
    const data = await getVlsTaxationLawSummary(req.query, req.tenant);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const exportVlsTaxationLawRegistrations = async (req, res, next) => {
  try {
    const report = await exportVlsTaxationLawReport(req.query, req.tenant);
    res.setHeader("Content-Type", report.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);
    return res.status(200).send(report.buffer);
  } catch (error) {
    return next(error);
  }
};

export const getVlsTaxationLawRegistration = async (req, res, next) => {
  try {
    const data = await getVlsTaxationLawRegistrationById(
      req.params.id,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const createVlsTaxationLawRegistrationRecord = async (req, res, next) => {
  try {
    const data = await createVlsTaxationLawRegistration(
      req.body,
      req.tenant,
      req.query._client_key,
    );
    return res.status(201).json({
      success: true,
      message: "Taxation Law registration created successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const updateVlsTaxationLawRegistrationRecord = async (req, res, next) => {
  try {
    const data = await updateVlsTaxationLawRegistration(
      req.params.id,
      req.body,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({
      success: true,
      message: "Taxation Law registration updated successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const deleteVlsTaxationLawRegistrationRecord = async (req, res, next) => {
  try {
    await deleteVlsTaxationLawRegistration(
      req.params.id,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({
      success: true,
      message: "Taxation Law registration deleted successfully",
    });
  } catch (error) {
    return next(error);
  }
};
