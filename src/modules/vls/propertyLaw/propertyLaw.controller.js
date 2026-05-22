import {
  registerPropertyLaw,
  createPropertyLawByAdmin,
  updatePropertyLawById,
  listPropertyLaw,
  getPropertyLawById,
  deletePropertyLawById,
} from "./propertyLaw.service.js";

const resolveErrorStatus = (message = "") => {
  const msg = message.toLowerCase();
  if (msg.includes("not found")) return 404;
  if (msg.includes("unauthorized")) return 403;
  if (msg.includes("invalid") || msg.includes("validation")) return 400;
  return 500;
};

export const registerPropertyLawHandler = async (req, res) => {
  try {
    const record = await registerPropertyLaw(req.body, req.publicTenantId);
    return res
      .status(201)
      .json({ message: "Registration successful", data: record });
  } catch (err) {
    const status = resolveErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const createPropertyLawAdminHandler = async (req, res) => {
  try {
    const record = await createPropertyLawByAdmin(req.body, req.tenant);
    return res
      .status(201)
      .json({ message: "Registration successful", data: record });
  } catch (err) {
    const status = resolveErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const updatePropertyLawHandler = async (req, res) => {
  try {
    const record = await updatePropertyLawById(req.params.id, req.body, req.tenant);
    return res.status(200).json({ message: "Record updated successfully", data: record });
  } catch (err) {
    const status = resolveErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const getPropertyLawHandler = async (req, res) => {
  try {
    const records = await listPropertyLaw(req.tenant);
    return res.status(200).json({ data: records });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const getPropertyLawByIdHandler = async (req, res) => {
  try {
    const record = await getPropertyLawById(req.params.id, req.tenant);
    if (!record) return res.status(404).json({ message: "Record not found" });
    return res.status(200).json({ data: record });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const deletePropertyLawHandler = async (req, res) => {
  try {
    await deletePropertyLawById(req.params.id, req.tenant);
    return res.status(200).json({ message: "Record deleted successfully" });
  } catch (err) {
    const status = resolveErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};
