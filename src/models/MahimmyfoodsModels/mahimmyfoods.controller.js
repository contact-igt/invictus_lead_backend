import dayjs from "dayjs";
import { missingFieldsChecker } from "../../utils/missingFieldChecker.js";

import {
  createMahimmyRegisterService,
  deleteByIdMahimmyRegisterService,
  getAllMahimmyRegisterService,
  getByIdMahimmyRegisterService,
} from "./mahimmyfoods.service.js";

export const createMahimmyRegisterController = async (req, res) => {
  const {
    first_name,
    last_name,
    mobile,
    email,
    menu,
    message,
    ip_address,
    utm_source,
  } = req.body;

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
    await createMahimmyRegisterService(
      first_name ? first_name : null,
      last_name ? last_name : null,
      mobile ? mobile : null,
      email ? email : null,
      menu ? menu : null,
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

export const getAllMahimmyRegisterController = async (req, res) => {
  try {
    const response = await getAllMahimmyRegisterService();

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

export const getByIdMahimmyRegisterController = async (req, res) => {
  const { id } = req.params;

  try {
    const response = await getByIdMahimmyRegisterService(id);

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

export const deleteByIdMahimmyRegisterController = async (req, res) => {
  const { id } = req.params;

  try {
    await deleteByIdMahimmyRegisterService(id);

    return res.status(200).json({
      message: "Data removed successfully",
    });
  } catch (err) {
    return req.status(500).json({
      message: err?.message,
    });
  }
};
