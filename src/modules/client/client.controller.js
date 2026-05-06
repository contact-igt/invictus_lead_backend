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
  if (message.includes("required") || message.includes("validation") || message.includes("invalid")) {
    return 400;
  }

  return 500;
};

export const getClients = async (req, res) => {
  try {
    const clients = await listClients();
    return res.status(200).json({ data: clients });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const getClientById = async (req, res) => {
  try {
    const client = await getClient(req.params.id);
    if (!client) return res.status(404).json({ message: "Client not found" });
    return res.status(200).json({ data: client });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const createClientRecord = async (req, res) => {
  try {
    const client = await createClient(req.body);
    return res
      .status(201)
      .json({ message: "Client created successfully", data: client });
  } catch (err) {
    const status = resolveClientErrorStatus(err);
    return res.status(status).json({ message: err.message });
  }
};

export const updateClientRecord = async (req, res) => {
  try {
    const client = await updateClient(req.params.id, req.body);
    return res
      .status(200)
      .json({ message: "Client updated successfully", data: client });
  } catch (err) {
    const status = resolveClientErrorStatus(err);
    return res.status(status).json({ message: err.message });
  }
};

export const deleteClientRecord = async (req, res) => {
  try {
    await deleteClient(req.params.id);
    return res.status(200).json({ message: "Client deleted successfully" });
  } catch (err) {
    const status = resolveClientErrorStatus(err);
    return res.status(status).json({ message: err.message });
  }
};
