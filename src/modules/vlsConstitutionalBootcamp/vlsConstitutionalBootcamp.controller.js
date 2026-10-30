import {
  createVlsConstitutionalBootcampRegistration,
  createVlsConstitutionalBootcampPublicRegistration,
  deleteVlsConstitutionalBootcampRegistration,
  exportVlsConstitutionalBootcampReport,
  getVlsConstitutionalBootcampRegistrationById,
  getVlsConstitutionalBootcampSummary,
  listVlsConstitutionalBootcampRegistrations,
  updateVlsConstitutionalBootcampRegistration,
} from "./vlsConstitutionalBootcamp.service.js";

export const registerVlsConstitutionalBootcampPublicLead = async (req, res, next) => {
  try {
    const data = await createVlsConstitutionalBootcampPublicRegistration(req.body, req.publicTenantId);
    return res.status(201).json({
      success: true,
      message: "Constitutional Bootcamp registration created successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const getVlsConstitutionalBootcampRegistrations = async (req, res, next) => {
  try {
    const result = await listVlsConstitutionalBootcampRegistrations(req.query, req.tenant);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
};

export const getVlsConstitutionalBootcampSummaryMetrics = async (req, res, next) => {
  try {
    const data = await getVlsConstitutionalBootcampSummary(req.query, req.tenant);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const exportVlsConstitutionalBootcampRegistrations = async (req, res, next) => {
  try {
    const report = await exportVlsConstitutionalBootcampReport(req.query, req.tenant);
    res.setHeader("Content-Type", report.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);
    return res.status(200).send(report.buffer);
  } catch (error) {
    return next(error);
  }
};

export const getVlsConstitutionalBootcampRegistration = async (req, res, next) => {
  try {
    const data = await getVlsConstitutionalBootcampRegistrationById(
      req.params.id,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const createVlsConstitutionalBootcampRegistrationRecord = async (req, res, next) => {
  try {
    const data = await createVlsConstitutionalBootcampRegistration(
      req.body,
      req.tenant,
      req.query._client_key,
    );
    return res.status(201).json({
      success: true,
      message: "Constitutional Bootcamp registration created successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const updateVlsConstitutionalBootcampRegistrationRecord = async (req, res, next) => {
  try {
    const data = await updateVlsConstitutionalBootcampRegistration(
      req.params.id,
      req.body,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({
      success: true,
      message: "Constitutional Bootcamp registration updated successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const deleteVlsConstitutionalBootcampRegistrationRecord = async (req, res, next) => {
  try {
    await deleteVlsConstitutionalBootcampRegistration(
      req.params.id,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({
      success: true,
      message: "Constitutional Bootcamp registration deleted successfully",
    });
  } catch (error) {
    return next(error);
  }
};
