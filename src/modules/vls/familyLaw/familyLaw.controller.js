import {
  registerFamilyLaw,
  createFamilyLawByAdmin,
  updateFamilyLawById,
  listFamilyLaw,
  getFamilyLawById,
  deleteFamilyLawById,
} from "./familyLaw.service.js";

const resolveErrorStatus = (message = "") => {
  const msg = message.toLowerCase();
  if (msg.includes("not found")) return 404;
  if (msg.includes("unauthorized")) return 403;
  if (msg.includes("invalid") || msg.includes("validation")) return 400;
  return 500;
};

export const registerFamilyLawHandler = async (req, res) => {
  try {
    const record = await registerFamilyLaw(req.body, req.publicTenantId);
    return res
      .status(201)
      .json({ message: "Registration successful", data: record });
  } catch (err) {
    const status = resolveErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const createFamilyLawAdminHandler = async (req, res) => {
  try {
    const record = await createFamilyLawByAdmin(req.body, req.tenant);
    return res
      .status(201)
      .json({ message: "Registration successful", data: record });
  } catch (err) {
    const status = resolveErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const updateFamilyLawHandler = async (req, res) => {
  try {
    const record = await updateFamilyLawById(req.params.id, req.body, req.tenant);
    return res.status(200).json({ message: "Record updated successfully", data: record });
  } catch (err) {
    const status = resolveErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const getFamilyLawHandler = async (req, res) => {
  try {
    const records = await listFamilyLaw(req.tenant);
    return res.status(200).json({ data: records });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const getFamilyLawByIdHandler = async (req, res) => {
  try {
    const record = await getFamilyLawById(req.params.id, req.tenant);
    if (!record) return res.status(404).json({ message: "Record not found" });
    return res.status(200).json({ data: record });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const deleteFamilyLawHandler = async (req, res) => {
  try {
    await deleteFamilyLawById(req.params.id, req.tenant);
    return res.status(200).json({ message: "Record deleted successfully" });
  } catch (err) {
    const status = resolveErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};
