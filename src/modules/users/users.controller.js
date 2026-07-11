import {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
} from "./users.service.js";

const resolveUserErrorStatus = (message = "") => {
  const normalized = message.toLowerCase();
  if (normalized.includes("not found")) return 404;
  if (normalized.includes("unauthorized")) return 403;
  if (normalized.includes("already") || normalized.includes("duplicate")) return 409;
  if (normalized.includes("invalid") || normalized.includes("required") || normalized.includes("validation")) return 400;
  return 500;
};

const sendUserError = (res, error) => {
  const status = resolveUserErrorStatus(error?.message);
  return res.status(status).json({
    message: status >= 500 ? "Internal Server Error" : error.message,
  });
};

export const getUsers = async (req, res) => {
  try {
    const users = await listUsers(req.tenant);
    return res.status(200).json({ data: users });
  } catch (error) {
    return sendUserError(res, error);
  }
};

export const getUser = async (req, res) => {
  try {
    const user = await getUserById(req.params.id, req.tenant);
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.status(200).json({ data: user });
  } catch (error) {
    return sendUserError(res, error);
  }
};

export const createUserHandler = async (req, res) => {
  try {
    const user = await createUser(req.body, req.tenant);
    return res.status(201).json({ message: "User created successfully", data: user });
  } catch (error) {
    return sendUserError(res, error);
  }
};

export const updateUserHandler = async (req, res) => {
  try {
    const user = await updateUser(req.params.id, req.body, req.tenant);
    return res.status(200).json({ message: "User updated successfully", data: user });
  } catch (error) {
    return sendUserError(res, error);
  }
};

export const deleteUserHandler = async (req, res) => {
  try {
    await deleteUser(req.params.id, req.tenant);
    return res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    return sendUserError(res, error);
  }
};
