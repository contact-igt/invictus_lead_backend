import {
  registerVlsContact,
  createVlsContactByAdmin,
  updateVlsContactById,
  listVlsContact,
  getVlsContactById,
  deleteVlsContactById,
} from "./vlsContact.service.js";

const resolveErrorStatus = (message = "") => {
  const msg = message.toLowerCase();
  if (msg.includes("not found")) return 404;
  if (msg.includes("unauthorized")) return 403;
  if (msg.includes("invalid") || msg.includes("validation")) return 400;
  return 500;
};

export const registerVlsContactHandler = async (req, res) => {
  try {
    const record = await registerVlsContact(req.body, req.publicTenantId);
    return res.status(201).json({ message: "Enquiry submitted successfully", data: record });
  } catch (err) {
    const status = resolveErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const createVlsContactAdminHandler = async (req, res) => {
  try {
    const record = await createVlsContactByAdmin(req.body, req.tenant);
    return res.status(201).json({ message: "Record created successfully", data: record });
  } catch (err) {
    const status = resolveErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const updateVlsContactHandler = async (req, res) => {
  try {
    const record = await updateVlsContactById(req.params.id, req.body, req.tenant);
    return res.status(200).json({ message: "Record updated successfully", data: record });
  } catch (err) {
    const status = resolveErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const getVlsContactHandler = async (req, res) => {
  try {
    const records = await listVlsContact(req.tenant);
    return res.status(200).json({ data: records });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const getVlsContactByIdHandler = async (req, res) => {
  try {
    const record = await getVlsContactById(req.params.id, req.tenant);
    if (!record) return res.status(404).json({ message: "Record not found" });
    return res.status(200).json({ data: record });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const deleteVlsContactHandler = async (req, res) => {
  try {
    await deleteVlsContactById(req.params.id, req.tenant);
    return res.status(200).json({ message: "Record deleted successfully" });
  } catch (err) {
    const status = resolveErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};
