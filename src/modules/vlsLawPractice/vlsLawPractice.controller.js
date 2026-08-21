import {
  createVlsLawPracticeRegistration,
  createVlsLawPracticePublicRegistration,
  deleteVlsLawPracticeRegistration,
  exportVlsLawPracticeReport,
  getVlsLawPracticeRegistrationById,
  getVlsLawPracticeSummary,
  listVlsLawPracticeRegistrations,
  updateVlsLawPracticeRegistration,
} from "./vlsLawPractice.service.js";

export const registerVlsLawPracticePublicLead = async (req, res, next) => {
  try {
    const data = await createVlsLawPracticePublicRegistration(req.body, req.publicTenantId);
    return res.status(201).json({
      success: true,
      message: "Law Practice registration created successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const getVlsLawPracticeRegistrations = async (req, res, next) => {
  try {
    const result = await listVlsLawPracticeRegistrations(req.query, req.tenant);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
};

export const getVlsLawPracticeSummaryMetrics = async (req, res, next) => {
  try {
    const data = await getVlsLawPracticeSummary(req.query, req.tenant);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const exportVlsLawPracticeRegistrations = async (req, res, next) => {
  try {
    const report = await exportVlsLawPracticeReport(req.query, req.tenant);
    res.setHeader("Content-Type", report.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);
    return res.status(200).send(report.buffer);
  } catch (error) {
    return next(error);
  }
};

export const getVlsLawPracticeRegistration = async (req, res, next) => {
  try {
    const data = await getVlsLawPracticeRegistrationById(
      req.params.id,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const createVlsLawPracticeRegistrationRecord = async (req, res, next) => {
  try {
    const data = await createVlsLawPracticeRegistration(
      req.body,
      req.tenant,
      req.query._client_key,
    );
    return res.status(201).json({
      success: true,
      message: "Law Practice registration created successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const updateVlsLawPracticeRegistrationRecord = async (req, res, next) => {
  try {
    const data = await updateVlsLawPracticeRegistration(
      req.params.id,
      req.body,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({
      success: true,
      message: "Law Practice registration updated successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const deleteVlsLawPracticeRegistrationRecord = async (req, res, next) => {
  try {
    await deleteVlsLawPracticeRegistration(
      req.params.id,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({
      success: true,
      message: "Law Practice registration deleted successfully",
    });
  } catch (error) {
    return next(error);
  }
};
