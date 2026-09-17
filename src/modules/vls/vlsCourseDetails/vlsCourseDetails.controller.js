import {
  registerVlsCourseDetails,
  createVlsCourseDetailsByAdmin,
  updateVlsCourseDetailsById,
  listVlsCourseDetails,
  getVlsCourseDetailsById,
  deleteVlsCourseDetailsById,
} from "./vlsCourseDetails.service.js";

const resolveErrorStatus = (message = "") => {
  const msg = message.toLowerCase();
  if (msg.includes("not found")) return 404;
  if (msg.includes("unauthorized")) return 403;
  if (msg.includes("invalid") || msg.includes("validation")) return 400;
  return 500;
};

export const registerVlsCourseDetailsHandler = async (req, res) => {
  try {
    const record = await registerVlsCourseDetails(req.body, req.publicTenantId);
    return res.status(201).json({ message: "Submission received successfully", data: record });
  } catch (err) {
    const status = resolveErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const createVlsCourseDetailsAdminHandler = async (req, res) => {
  try {
    const record = await createVlsCourseDetailsByAdmin(req.body, req.tenant);
    return res.status(201).json({ message: "Record created successfully", data: record });
  } catch (err) {
    const status = resolveErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const updateVlsCourseDetailsHandler = async (req, res) => {
  try {
    const record = await updateVlsCourseDetailsById(req.params.id, req.body, req.tenant);
    return res.status(200).json({ message: "Record updated successfully", data: record });
  } catch (err) {
    const status = resolveErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const getVlsCourseDetailsHandler = async (req, res) => {
  try {
    const records = await listVlsCourseDetails(req.tenant);
    return res.status(200).json({ data: records });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const getVlsCourseDetailsByIdHandler = async (req, res) => {
  try {
    const record = await getVlsCourseDetailsById(req.params.id, req.tenant);
    if (!record) return res.status(404).json({ message: "Record not found" });
    return res.status(200).json({ data: record });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const deleteVlsCourseDetailsHandler = async (req, res) => {
  try {
    await deleteVlsCourseDetailsById(req.params.id, req.tenant);
    return res.status(200).json({ message: "Record deleted successfully" });
  } catch (err) {
    const status = resolveErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};
