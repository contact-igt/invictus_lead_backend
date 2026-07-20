import bcrypt from "bcrypt";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../../middlewares/auth/authMiddlewares.js";
import { loginService } from "./auth.service.js";

export const loginController = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const user = await loginService(email);

    if (!user) {
      return res.status(401).json({ message: "Incorrect Email" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Incorrect Password" });
    }

    // Generate tokens with clientId
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    return res.status(200).json({
      message: "Login successful",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        clientId: user.client_id,
        clientKey: user.client?.client_key || null,
        clientName: user.client?.name || "System",
      },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error("[login]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const refreshController = async (req, res) => {
  const { refreshToken: suppliedRefreshToken } = req.body || {};

  if (!suppliedRefreshToken) {
    return res.status(400).json({ message: "Refresh token required" });
  }

  try {
    const decoded = verifyRefreshToken(suppliedRefreshToken);
    const user = await loginService(decoded.email);

    if (!user || user.id !== decoded.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    return res.status(200).json({
      accessToken: generateAccessToken(user),
      refreshToken: generateRefreshToken(user),
    });
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }
};
