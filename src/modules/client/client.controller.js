import {
  listClients,
  getClient,
  createClient,
  updateClient,
  deleteClient,
} from "./client.service.js";

const resolveClientErrorStatus = (err) => {
  const message = (err?.message || "").toLowerCase();
  if (err?.name === "SequelizeUniqueConstraintError") return 409;
  if (message.includes("not found")) return 404;
  if (message.includes("required") || message.includes("validation") || message.includes("invalid")) return 400;
  return 500;
};

const sendClientError = (res, error) => {
  const status = resolveClientErrorStatus(error);
  return res.status(status).json({
    message: status >= 500 ? "Internal Server Error" : error.message,
  });
};

export const getClients = async (_req, res) => {
  try {
    const clients = await listClients();
    return res.status(200).json({ data: clients });
  } catch (error) {
    return sendClientError(res, error);
  }
};

export const getClientById = async (req, res) => {
  try {
    const client = await getClient(req.params.id);
    if (!client) return res.status(404).json({ message: "Client not found" });
    return res.status(200).json({ data: client });
  } catch (error) {
    return sendClientError(res, error);
  }
};

export const createClientRecord = async (req, res) => {
  try {
    const client = await createClient(req.body);
    return res.status(201).json({ message: "Client created successfully", data: client });
  } catch (error) {
    return sendClientError(res, error);
  }
};

export const updateClientRecord = async (req, res) => {
  try {
    const client = await updateClient(req.params.id, req.body);
    return res.status(200).json({ message: "Client updated successfully", data: client });
  } catch (error) {
    return sendClientError(res, error);
  }
};

export const deleteClientRecord = async (req, res) => {
  try {
    await deleteClient(req.params.id);
    return res.status(200).json({ message: "Client deleted successfully" });
  } catch (error) {
    return sendClientError(res, error);
  }
};
