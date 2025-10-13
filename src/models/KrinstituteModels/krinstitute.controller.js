import dayjs from "dayjs";
import { missingFieldsChecker } from "../../utils/missingFieldChecker.js";

import {
  createKrinstituteRegisterService,
  deleteByIdKrinstituteRegisterService,
  getAllKrinstituteRegisterService,
  getByIdKrinstituteRegisterService,
} from "./krinstitute.service.js";

export const createKrinstituteRegisterController = async (req, res) => {
  const { name, mobile, email, course, ip_address, utm_source } = req.body;

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
    await createKrinstituteRegisterService(
      name ? name : null,
      mobile ? mobile : null,
      email ? email : null,
      course ? course : null,
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

export const getAllKrinstituteRegisterController = async (req, res) => {
  try {
    const response = await getAllKrinstituteRegisterService();

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

export const getByIdKrinstituteRegisterController = async (req, res) => {
  const { id } = req.params;

  try {
    const response = await getByIdKrinstituteRegisterService(id);

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

export const deleteByIdKrinstituteRegisterController = async (req, res) => {
  const { id } = req.params;

  try {
    await deleteByIdKrinstituteRegisterService(id);

    return res.status(200).json({
      message: "Data removed successfully",
    });
  } catch (err) {
    return req.status(500).json({
      message: err?.message,
    });
  }
};
