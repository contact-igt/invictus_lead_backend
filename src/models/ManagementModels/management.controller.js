import { generateAccessToken, generateRefreshToken } from "../../middlewares/auth/authMiddlewares.js";
import { missingFieldsChecker } from "../../utils/missingFieldChecker.js";
import {
  createManagementService,
  loginManagementService,
} from "./management.service.js";
import bcrypt from "bcrypt";

export const createManagementController = async (req, res) => {
  const {
    title,
    username,
    email,
    country_code,
    mobile,
    profile_picture,
    password,
    role,
  } = req.body;

  const requiredFields = {
    title,
    username,
    email,
    mobile,
    password,
    role,
  };

  const missingFields = await missingFieldsChecker(requiredFields);

  if (missingFields?.length > 0) {
    return res.status(400).json({
      message: `The missing fields are  ${missingFields.join(", ")} `,
    });
  }

  try {
    await createManagementService(
      title,
      username,
      email,
      country_code,
      mobile,
      profile_picture ? profile_picture : null,
      password,
      role
    );

    return res.status(200).json({
      message: "Management created successfully",
    });
  } catch (err) {
    if (err.original?.code === "ER_DUP_ENTRY") {
      return res
        .status(400)
        .json({ message: "Email or mobile number already in use" });
    }

    return res.status(500).json({
      message: err?.message,
    });
  }
};

export const loginManagementController = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({
        message: "email and password required",
      });
    }

    const user = await loginManagementService(email);

    if (!user) {
      return res.status(401).json({ message: "Incorrect Email" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Incorrect Password" });
    }
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    return res.status(200).json({
      message: "Login successful",
      user: {
        id: user?.id,
        title: user?.title,
        username: user?.username,
        email: user?.email,
        profile: user?.profile_picture,
        role: user?.role,
      },
      accessToken: accessToken,
      refreshToken: refreshToken,
    });
  } catch (err) {
    return res.status(500).json({
      message: err?.message,
    });
  }
};


