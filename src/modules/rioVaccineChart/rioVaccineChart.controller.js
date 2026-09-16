import {
  listVaccineChartLeads,
  getVaccineChartLeadById,
  createVaccineChartLead,
  createVaccineChartPublicLead,
  updateVaccineChartLead,
  deleteVaccineChartLead,
} from "./rioVaccineChart.service.js";

export const registerVaccineChartPublicLead = async (req, res, next) => {
  try {
    const data = await createVaccineChartPublicLead(req.body, req.publicTenantId);
    return res.status(201).json({
      success: true,
      message: "Vaccine chart lead created successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const getVaccineChartLeads = async (req, res, next) => {
  try {
    const result = await listVaccineChartLeads(req.query, req.tenant);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
};

export const getVaccineChartLead = async (req, res, next) => {
  try {
    const data = await getVaccineChartLeadById(
      req.params.id,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const createVaccineChartLeadRecord = async (req, res, next) => {
  try {
    const data = await createVaccineChartLead(
      req.body,
      req.tenant,
      req.query._client_key || req.body._client_key,
    );
    return res.status(201).json({
      success: true,
      message: "Vaccine chart lead created successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const updateVaccineChartLeadRecord = async (req, res, next) => {
  try {
    const data = await updateVaccineChartLead(
      req.params.id,
      req.body,
      req.tenant,
      req.query._client_key,
    );
    return res.status(200).json({
      success: true,
      message: "Vaccine chart lead updated successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const deleteVaccineChartLeadRecord = async (req, res, next) => {
  try {
    await deleteVaccineChartLead(req.params.id, req.tenant, req.query._client_key);
    return res.status(200).json({
      success: true,
      message: "Vaccine chart lead deleted successfully",
    });
  } catch (error) {
    return next(error);
  }
};
