import {
  registerVlsDopAiAssisted,
  createVlsDopAiAssistedByAdmin,
  updateVlsDopAiAssistedById,
  listVlsDopAiAssisted,
  getVlsDopAiAssistedById,
  deleteVlsDopAiAssistedById,
} from "./vlsDopAiAssisted.service.js";

const resolveErrorStatus = (message = "") => {
  const msg = message.toLowerCase();
  if (msg.includes("not found")) return 404;
  if (msg.includes("unauthorized")) return 403;
  if (msg.includes("invalid") || msg.includes("validation")) return 400;
  return 500;
};

export const registerVlsDopAiAssistedHandler = async (req, res) => {
  try {
    const record = await registerVlsDopAiAssisted(req.body, req.publicTenantId);
    return res
      .status(201)
      .json({ message: "Registration successful", data: record });
  } catch (err) {
    const status = resolveErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const createVlsDopAiAssistedAdminHandler = async (req, res) => {
  try {
    const record = await createVlsDopAiAssistedByAdmin(req.body, req.tenant);
    return res
      .status(201)
      .json({ message: "Registration successful", data: record });
  } catch (err) {
    const status = resolveErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const updateVlsDopAiAssistedHandler = async (req, res) => {
  try {
    const record = await updateVlsDopAiAssistedById(req.params.id, req.body, req.tenant);
    return res.status(200).json({ message: "Record updated successfully", data: record });
  } catch (err) {
    const status = resolveErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const getVlsDopAiAssistedHandler = async (req, res) => {
  try {
    const records = await listVlsDopAiAssisted(req.tenant);
    return res.status(200).json({ data: records });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const getVlsDopAiAssistedByIdHandler = async (req, res) => {
  try {
    const record = await getVlsDopAiAssistedById(req.params.id, req.tenant);
    if (!record) return res.status(404).json({ message: "Record not found" });
    return res.status(200).json({ data: record });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const deleteVlsDopAiAssistedHandler = async (req, res) => {
  try {
    await deleteVlsDopAiAssistedById(req.params.id, req.tenant);
    return res.status(200).json({ message: "Record deleted successfully" });
  } catch (err) {
    const status = resolveErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};
