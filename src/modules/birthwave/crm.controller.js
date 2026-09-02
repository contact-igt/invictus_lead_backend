import {
  listFields,
  createField,
  updateField,
  archiveField,
  reorderFields,
  listCalls,
  ingestCall,
  listIntegrations,
  updateIntegration,
  listMappings,
  saveMappings,
} from "./crm.service.js";

export const getFieldsHandler = async (req, res, next) => {
  try {
    const data = await listFields(req.tenant, req.query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const createFieldHandler = async (req, res, next) => {
  try {
    const data = await createField(req.tenant, req.body);
    return res.status(201).json({ success: true, message: "Field created", data });
  } catch (error) {
    return next(error);
  }
};

export const updateFieldHandler = async (req, res, next) => {
  try {
    const data = await updateField(req.tenant, req.params.id, req.body);
    return res.status(200).json({ success: true, message: "Field updated", data });
  } catch (error) {
    return next(error);
  }
};

export const archiveFieldHandler = async (req, res, next) => {
  try {
    const data = await archiveField(req.tenant, req.params.id);
    return res.status(200).json({ success: true, message: "Field archived", data });
  } catch (error) {
    return next(error);
  }
};

export const reorderFieldsHandler = async (req, res, next) => {
  try {
    const data = await reorderFields(req.tenant, req.body.ordered_ids || []);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const getCallsHandler = async (req, res, next) => {
  try {
    const result = await listCalls(req.tenant, req.query);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
};

export const ingestCallHandler = async (req, res, next) => {
  try {
    const data = await ingestCall(req.tenant, req.params.provider, req.body);
    return res.status(201).json({ success: true, message: "Call ingested", data });
  } catch (error) {
    return next(error);
  }
};

export const getIntegrationsHandler = async (req, res, next) => {
  try {
    const data = await listIntegrations(req.tenant);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const updateIntegrationHandler = async (req, res, next) => {
  try {
    const data = await updateIntegration(req.tenant, req.params.provider, req.body);
    return res.status(200).json({ success: true, message: "Integration updated", data });
  } catch (error) {
    return next(error);
  }
};

export const getMappingsHandler = async (req, res, next) => {
  try {
    const data = await listMappings(req.tenant, req.query.provider);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const saveMappingsHandler = async (req, res, next) => {
  try {
    const data = await saveMappings(req.tenant, req.body.provider, req.body.mappings || []);
    return res.status(200).json({ success: true, message: "Field mapping saved", data });
  } catch (error) {
    return next(error);
  }
};
