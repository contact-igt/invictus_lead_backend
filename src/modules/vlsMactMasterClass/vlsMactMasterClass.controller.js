import {
  createVlsMactMasterClassRegistration,
  createVlsMactMasterClassPublicRegistration,
  deleteVlsMactMasterClassRegistration,
  exportVlsMactMasterClassReport,
  getVlsMactMasterClassRegistrationById,
  getVlsMactMasterClassSummary,
  listVlsMactMasterClassRegistrations,
  updateVlsMactMasterClassRegistration,
} from "./vlsMactMasterClass.service.js";

export const registerVlsMactMasterClassPublicLead = async (req, res, next) => {
  try {
    const data = await createVlsMactMasterClassPublicRegistration(req.body, req.publicTenantId);
    return res.status(201).json({
      success: true,
      message: "MACT Master Class registration created successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const getVlsMactMasterClassRegistrations = async (req, res, next) => {
  try {
    const result = await listVlsMactMasterClassRegistrations(req.query, req.tenant);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
};

export const getVlsMactMasterClassSummaryMetrics = async (req, res, next) => {
  try {
    const data = await getVlsMactMasterClassSummary(req.query, req.tenant);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const exportVlsMactMasterClassRegistrations = async (req, res, next) => {
  try {
    const report = await exportVlsMactMasterClassReport(req.query, req.tenant);
    res.setHeader("Content-Type", report.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);
    return res.status(200).send(report.buffer);
  } catch (error) {
    return next(error);
  }
};

export const getVlsMactMasterClassRegistration = async (req, res, next) => {
  try {
    const data = await getVlsMactMasterClassRegistrationById(
      req.params.id,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const createVlsMactMasterClassRegistrationRecord = async (req, res, next) => {
  try {
    const data = await createVlsMactMasterClassRegistration(
      req.body,
      req.tenant,
      req.query._client_key,
    );
    return res.status(201).json({
      success: true,
      message: "MACT Master Class registration created successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const updateVlsMactMasterClassRegistrationRecord = async (req, res, next) => {
  try {
    const data = await updateVlsMactMasterClassRegistration(
      req.params.id,
      req.body,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({
      success: true,
      message: "MACT Master Class registration updated successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const deleteVlsMactMasterClassRegistrationRecord = async (req, res, next) => {
  try {
    await deleteVlsMactMasterClassRegistration(
      req.params.id,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({
      success: true,
      message: "MACT Master Class registration deleted successfully",
    });
  } catch (error) {
    return next(error);
  }
};
