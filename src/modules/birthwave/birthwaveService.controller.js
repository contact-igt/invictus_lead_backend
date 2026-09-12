import {
  listServices,
  listActiveServicesForPublic,
  createService,
  updateService,
  reorderServices,
} from "./birthwaveService.service.js";

export const listServicesHandler = async (req, res, next) => {
  try {
    const data = await listServices(req.tenant, req.query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const createServiceHandler = async (req, res, next) => {
  try {
    const data = await createService(req.tenant, req.body, req.user);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const updateServiceHandler = async (req, res, next) => {
  try {
    const data = await updateService(req.tenant, req.params.id, req.body, req.user);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const reorderServicesHandler = async (req, res, next) => {
  try {
    const data = await reorderServices(req.tenant, req.body.order, req.user);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

/**
 * Public, unauthenticated read for the website and landing pages. The tenant is
 * resolved from the X-Client-Key header by resolvePublicTenantForModule, and only
 * active services are exposed, in the admin-defined display order.
 */
export const listPublicServicesHandler = async (req, res, next) => {
  try {
    const data = await listActiveServicesForPublic(req.publicTenantId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export default {
  listServicesHandler,
  createServiceHandler,
  updateServiceHandler,
  reorderServicesHandler,
  listPublicServicesHandler,
};
