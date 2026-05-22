import {
  registerVlsAibe,
  createVlsAibeByAdmin,
  updateVlsAibeById,
  listVlsAibe,
  getVlsAibeById,
  deleteVlsAibeById,
} from "./vlsAibe.service.js";

const resolveErrorStatus = (message = "") => {
  const msg = message.toLowerCase();
  if (msg.includes("not found")) return 404;
  if (msg.includes("unauthorized")) return 403;
  if (msg.includes("invalid") || msg.includes("validation")) return 400;
  return 500;
};

export const registerVlsAibeHandler = async (req, res) => {
  try {
    const record = await registerVlsAibe(req.body, req.publicTenantId);
    return res
      .status(201)
      .json({ message: "Registration successful", data: record });
  } catch (err) {
    const status = resolveErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const createVlsAibeAdminHandler = async (req, res) => {
  try {
    const record = await createVlsAibeByAdmin(req.body, req.tenant);
    return res
      .status(201)
      .json({ message: "Registration successful", data: record });
  } catch (err) {
    const status = resolveErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const updateVlsAibeHandler = async (req, res) => {
  try {
    const record = await updateVlsAibeById(req.params.id, req.body, req.tenant);
    return res.status(200).json({ message: "Record updated successfully", data: record });
  } catch (err) {
    const status = resolveErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const listVlsAibeHandler = async (req, res) => {
  try {
    const records = await listVlsAibe(req.tenant);
    return res.status(200).json({ data: records });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const getVlsAibeByIdHandler = async (req, res) => {
  try {
    const record = await getVlsAibeById(req.params.id, req.tenant);
    if (!record) return res.status(404).json({ message: "Record not found" });
    return res.status(200).json({ data: record });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const deleteVlsAibeHandler = async (req, res) => {
  try {
    await deleteVlsAibeById(req.params.id, req.tenant);
    return res.status(200).json({ message: "Record deleted successfully" });
  } catch (err) {
    const status = resolveErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};
