import dayjs from "dayjs";
import { missingFieldsChecker } from "../../utils/missingFieldChecker.js";

import {
  createInvictusRegisterService,
  deleteByIdInvictusRegisterService,
  getAllInvictusRegisterService,
  getByIdInvictusRegisterService,
} from "./invictus.service.js";

export const createInvictusRegisterController = async (req, res) => {
  const { name, mobile, email, service, description, ip_address, utm_source } =
    req.body;

  const requiredFields = {
    mobile,
    email,
  };

  const missingFields = await missingFieldsChecker(requiredFields);

  if (missingFields?.length > 0) {
    return res.status(400).json({
      message: `The missing fields are  ${missingFields.join(", ")} `,
    });
  }

  const registered_date = dayjs().format("YYYY-MM-DD hh:mm:ss");

  try {
    await createInvictusRegisterService(
      name ? name : null,
      mobile ? mobile : null,
      email ? email : null,
      service ? service : null,
      description ? description : null,
      registered_date,
      ip_address ? ip_address : null,
      utm_source ? utm_source : null
    );

    return res.status(200).json({
      message: "Registered Successfully",
    });
  } catch (err) {
    return res.status(500).json({
      message: err?.message,
    });
  }
};

export const getAllInvictusRegisterController = async (req, res) => {
  try {
    const response = await getAllInvictusRegisterService();

    return res.status(200).json({
      message: "Data fetched successfully",
      data: response,
    });
  } catch (err) {
    return res.status(500).json({
      message: err?.message,
    });
  }
};

export const getByIdInvictusRegisterController = async (req, res) => {
  const { id } = req.params;

  try {
    const response = await getByIdInvictusRegisterService(id);

    return res.status(200).json({
      message: "Data fetched successfully",
      data: response,
    });
  } catch (err) {
    return res.status(500).json({
      message: err?.message,
    });
  }
};

export const deleteByIdInvictusRegisterController = async (req, res) => {
  const { id } = req.params;

  try {
    await deleteByIdInvictusRegisterService(id);

    return res.status(200).json({
      message: "Data removed successfully",
    });
  } catch (err) {
    return req.status(500).json({
      message: err?.message,
    });
  }
};
