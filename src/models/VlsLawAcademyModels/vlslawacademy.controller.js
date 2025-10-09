import dayjs from "dayjs";
import { missingFieldsChecker } from "../../utils/missingFieldChecker.js";
import {
  createRegisterService,
  deleteRegisterService,
  getAllRegisterService,
  getByIdRegisterService,
} from "./vlslawacademy.service.js";

export const createRegisterController = async (req, res) => {
  const { name, email, mobile, message, ip_address, utm_source } = req.body;

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
    await createRegisterService(
      name ? name : null,
      email ? email : null,
      mobile ? mobile : null,
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

export const getAllRegisterController = async (req, res) => {
  try {
    const response = await getAllRegisterService();

    // const output = response?.map((item) => ({
    //   ...item,
    //   time: dayjs(item?.registered_date).format("hh:mm A"),
    // }));

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

export const getByIdRegisterController = async (req, res) => {
  const { id } = req.params;

  try {
    const response = await getByIdRegisterService(id);

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

export const deleteRegisterController = async (req, res) => {
  const { id } = req.params;

  try {
    await deleteRegisterService(id);

    return res.status(200).json({
      message: "Data removed successfully",
    });
  } catch (err) {
    return req.status(500).json({
      message: err?.message,
    });
  }
};
