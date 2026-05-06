import jwt from "jsonwebtoken";
import ServerEnvironmentConfig from "../../config/server.config.js";

const getClientKey = (user) => {
  if (user.clientKey) return user.clientKey; // If already provided
  if (user.client?.client_key) {
    return user.client.client_key;
  }
  if (user.client && user.client.name) {
    return user.client.name.toLowerCase().replace(/ /g, "_");
  }
  return null;
};

const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role ? user.role : "user",
      clientId: user.client_id || null,
      clientKey: getClientKey(user),
    },
    ServerEnvironmentConfig?.jwt_key,
    { expiresIn: "24h" },
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role ? user.role : "user",
      clientId: user.client_id || null,
      clientKey: getClientKey(user),
    },
    ServerEnvironmentConfig?.jwt_key,
    {
      expiresIn: "7d",
    },
  );
};

// user token auth
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  jwt.verify(token, ServerEnvironmentConfig.jwt_key, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Unauthorized" });
    }
    req.user = user;
    next();
  });
};

// super admin token auth
const authenticateSuperAdminToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, ServerEnvironmentConfig.jwt_key);

    if (decoded.role !== "super-admin") {
      return res.status(403).json({
        message: "You don't have permission to manage",
      });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: "Unauthorized" });
  }
};

// management token auth
const authenticateManagementToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, ServerEnvironmentConfig.jwt_key);

    if (decoded.role !== "super-admin" && decoded.role !== "admin") {
      return res.status(403).json({
        message: "You don't have permission to manage",
      });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: "Unauthorized" });
  }
};

export {
  generateAccessToken,
  generateRefreshToken,
  authenticateToken,
  authenticateManagementToken,
  authenticateSuperAdminToken,
};
