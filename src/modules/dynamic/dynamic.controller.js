import {
  listDynamicRecords,
  getDynamicRecord,
  createDynamicRecord,
  updateDynamicRecord,
  deleteDynamicRecord,
} from "./dynamic.service.js";
import { getSupportedDynamicModels } from "./modelRegistry.js";

const resolveDynamicErrorStatus = (message = "") => {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("not found") ||
    normalized.includes("model not found")
  )
    return 404;
  if (normalized.includes("unauthorized")) return 403;
  if (normalized.includes("invalid") || normalized.includes("validation"))
    return 400;

  return 500;
};

export const getDynamicData = async (req, res) => {
  try {
    const data = await listDynamicRecords(req.params.model, req.tenant);
    return res.status(200).json({ data });
  } catch (err) {
    const status = resolveDynamicErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const getDynamicDataById = async (req, res) => {
  try {
    const record = await getDynamicRecord(
      req.params.model,
      req.params.id,
      req.tenant,
    );
    if (!record) {
      return res.status(404).json({ message: "Record not found" });
    }
    return res.status(200).json({ data: record });
  } catch (err) {
    const status = resolveDynamicErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const createDynamicData = async (req, res) => {
  try {
    const record = await createDynamicRecord(
      req.params.model,
      req.body,
      req.tenant,
    );
    return res
      .status(201)
      .json({ message: "Record created successfully", data: record });
  } catch (err) {
    const status = resolveDynamicErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const updateDynamicData = async (req, res) => {
  try {
    const record = await updateDynamicRecord(
      req.params.model,
      req.params.id,
      req.body,
      req.tenant,
    );
    return res
      .status(200)
      .json({ message: "Record updated successfully", data: record });
  } catch (err) {
    const status = resolveDynamicErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const deleteDynamicData = async (req, res) => {
  try {
    await deleteDynamicRecord(req.params.model, req.params.id, req.tenant);
    return res.status(200).json({ message: "Record deleted successfully" });
  } catch (err) {
    const status = resolveDynamicErrorStatus(err.message);
    return res.status(status).json({ message: err.message });
  }
};

export const listDynamicModels = async (req, res) => {
  return res.status(200).json({ data: getSupportedDynamicModels() });
};
