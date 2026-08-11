import {
  registerVlsAiForAdvocates,
  createVlsAiForAdvocatesByAdmin,
  updateVlsAiForAdvocatesById,
  listVlsAiForAdvocates,
  getVlsAiForAdvocatesById,
  deleteVlsAiForAdvocatesById,
} from "./vlsAiForAdvocates.service.js";

const resolveErrorStatus = (message = "") => {
  const msg = message.toLowerCase();
  if (msg.includes("not found")) return 404;
  if (msg.includes("unauthorized")) return 403;
  if (msg.includes("invalid") || msg.includes("validation")) return 400;
  return 500;
};

export const registerVlsAiForAdvocatesHandler = async (req, res) => {
  try {
    const record = await registerVlsAiForAdvocates(req.body, req.publicTenantId);
    return res
      .status(201)
      .json({ message: "Registration successful", data: record });
  } catch (err) {
    const status = resolveErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const createVlsAiForAdvocatesAdminHandler = async (req, res) => {
  try {
    const record = await createVlsAiForAdvocatesByAdmin(req.body, req.tenant);
    return res
      .status(201)
      .json({ message: "Registration successful", data: record });
  } catch (err) {
    const status = resolveErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const updateVlsAiForAdvocatesHandler = async (req, res) => {
  try {
    const record = await updateVlsAiForAdvocatesById(req.params.id, req.body, req.tenant);
    return res.status(200).json({ message: "Record updated successfully", data: record });
  } catch (err) {
    const status = resolveErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const getVlsAiForAdvocatesHandler = async (req, res) => {
  try {
    const records = await listVlsAiForAdvocates(req.tenant);
    return res.status(200).json({ data: records });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const getVlsAiForAdvocatesByIdHandler = async (req, res) => {
  try {
    const record = await getVlsAiForAdvocatesById(req.params.id, req.tenant);
    if (!record) return res.status(404).json({ message: "Record not found" });
    return res.status(200).json({ data: record });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const deleteVlsAiForAdvocatesHandler = async (req, res) => {
  try {
    await deleteVlsAiForAdvocatesById(req.params.id, req.tenant);
    return res.status(200).json({ message: "Record deleted successfully" });
  } catch (err) {
    const status = resolveErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};
