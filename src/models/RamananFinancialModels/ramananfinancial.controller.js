import dayjs from "dayjs";
import { missingFieldsChecker } from "../../utils/missingFieldChecker.js";
import {
  createRamananFinancialRegisterService,
  deleteByIdRamananFinancialRegisterService,
  getAllRamananFinancialRegisterService,
  getByIdRamananFinancialRegisterService,
} from "./ramananfinancial.service.js";

export const createRamananFinancialRegisterController = async (req, res) => {
  const {
    name,
    email,
    mobile,
    area_of_interest,
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
    await createRamananFinancialRegisterService(
      name ? name : null,
      email ? email : null,
      mobile ? mobile : null,
      area_of_interest ? area_of_interest : null,
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

export const getAllRamananFinancialRegisterController = async (req, res) => {
  try {
    const response = await getAllRamananFinancialRegisterService();

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

export const getByIdRamananFinancialRegisterController = async (req, res) => {
  const { id } = req.params;

  try {
    const response = await getByIdRamananFinancialRegisterService(id);

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

export const deleteByIdRamananFinancialRegisterController = async (
  req,
  res
) => {
  const { id } = req.params;

  try {
    await deleteByIdRamananFinancialRegisterService(id);

    return res.status(200).json({
      message: "Data removed successfully",
    });
  } catch (err) {
    return req.status(500).json({
      message: err?.message,
    });
  }
};
