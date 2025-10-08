import dayjs from "dayjs";
import { missingFieldsChecker } from "../../utils/missingFieldChecker.js";
import {
  createRegisterService,
  deleteRegisterService,
  getAllRegisterService,
  getByIdRegisterService,
} from "./vlslawpractice.service.js";

export const createRegisterController = async (req, res) => {
  const {
    name,
    email,
    mobile,
    amount,
    programm_date,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    payment_status,
    captured,
    page_name,
  } = req.body;

  const requiredFields = {
    email,
    mobile,
    amount,
    payment_status,
    page_name,
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
      email,
      mobile,
      amount,
      programm_date,
      registered_date,
      razorpay_order_id ? razorpay_order_id : null,
      razorpay_payment_id ? razorpay_payment_id : null,
      razorpay_signature ? razorpay_signature : null,
      payment_status,
      captured ? captured : true,
      page_name
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

    const output = await response.map((item) => ({
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
