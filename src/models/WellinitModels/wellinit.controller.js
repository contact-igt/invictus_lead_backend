import dayjs from "dayjs";
import { missingFieldsChecker } from "../../utils/missingFieldChecker.js";

import {
  createWellinitRegisterService,
  deleteByIdWellinitRegisterService,
  getAllWellinitRegisterService,
  getByIdWellinitRegisterService,
} from "./wellinit.service.js";

export const createWellinitRegisterController = async (req, res) => {
  const { name, mobile, email, provider, message, ip_address, utm_source } =
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
    await createWellinitRegisterService(
      name ? name : null,
      mobile ? mobile : null,
      email ? email : null,
      provider ? provider : null,
      message ? message : null,
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

export const getAllWellinitRegisterController = async (req, res) => {
  try {
    const response = await getAllWellinitRegisterService();

    const output = response?.map((item) => ({
      ...item,
      time: dayjs(item?.registered_date).format("hh:mm A"),
    }));

    return res.status(200).json({
      message: "Data fetched successfully",
      data: output,
    });
  } catch (err) {
    return res.status(500).json({
      message: err?.message,
    });
  }
};

export const getByIdWellinitRegisterController = async (req, res) => {
  const { id } = req.params;

  try {
    const response = await getByIdWellinitRegisterService(id);

    return res.status(200).json({
      message: "Data fetched successfully",
      data: {
        ...response,
        time: dayjs(response?.registered_date).format("hh:mm A"),
      },
    });
  } catch (err) {
    return res.status(500).json({
      message: err?.message,
    });
  }
};

export const deleteByIdWellinitRegisterController = async (req, res) => {
  const { id } = req.params;

  try {
    await deleteByIdWellinitRegisterService(id);

    return res.status(200).json({
      message: "Data removed successfully",
    });
  } catch (err) {
    return req.status(500).json({
      message: err?.message,
    });
  }
};
