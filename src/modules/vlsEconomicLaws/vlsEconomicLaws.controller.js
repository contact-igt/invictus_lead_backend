import {
  createVlsEconomicLawsRegistration,
  createVlsEconomicLawsPublicRegistration,
  deleteVlsEconomicLawsRegistration,
  exportVlsEconomicLawsReport,
  getVlsEconomicLawsRegistrationById,
  getVlsEconomicLawsSummary,
  listVlsEconomicLawsRegistrations,
  updateVlsEconomicLawsRegistration,
} from "./vlsEconomicLaws.service.js";

export const registerVlsEconomicLawsPublicLead = async (req, res, next) => {
  try {
    const data = await createVlsEconomicLawsPublicRegistration(req.body, req.publicTenantId);
    return res.status(201).json({
      success: true,
      message: "Economic Laws & Practice registration created successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const getVlsEconomicLawsRegistrations = async (req, res, next) => {
  try {
    const result = await listVlsEconomicLawsRegistrations(req.query, req.tenant);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
};

export const getVlsEconomicLawsSummaryMetrics = async (req, res, next) => {
  try {
    const data = await getVlsEconomicLawsSummary(req.query, req.tenant);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const exportVlsEconomicLawsRegistrations = async (req, res, next) => {
  try {
    const report = await exportVlsEconomicLawsReport(req.query, req.tenant);
    res.setHeader("Content-Type", report.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);
    return res.status(200).send(report.buffer);
  } catch (error) {
    return next(error);
  }
};

export const getVlsEconomicLawsRegistration = async (req, res, next) => {
  try {
    const data = await getVlsEconomicLawsRegistrationById(
      req.params.id,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const createVlsEconomicLawsRegistrationRecord = async (req, res, next) => {
  try {
    const data = await createVlsEconomicLawsRegistration(
      req.body,
      req.tenant,
      req.query._client_key,
    );
    return res.status(201).json({
      success: true,
      message: "Economic Laws & Practice registration created successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const updateVlsEconomicLawsRegistrationRecord = async (req, res, next) => {
  try {
    const data = await updateVlsEconomicLawsRegistration(
      req.params.id,
      req.body,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({
      success: true,
      message: "Economic Laws & Practice registration updated successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const deleteVlsEconomicLawsRegistrationRecord = async (req, res, next) => {
  try {
    await deleteVlsEconomicLawsRegistration(
      req.params.id,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({
      success: true,
      message: "Economic Laws & Practice registration deleted successfully",
    });
  } catch (error) {
    return next(error);
  }
};
