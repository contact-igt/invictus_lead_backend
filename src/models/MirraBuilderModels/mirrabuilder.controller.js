import dayjs from "dayjs";
import { missingFieldsChecker } from "../../utils/missingFieldChecker.js";
import {
  createMirrabuildersRegisterService,
  deleteByIdMirrabuildersRegisterService,
  getAllMirrabuildersRegisterService,
  getByIdMirrabuildersRegisterService,
} from "./mirrabuilder.service.js";

export const createMirrabuildersRegisterController = async (req, res) => {
  const {
    name,
    mobile,
    interest_green_building,
    plot_build,
    budget,
    ip_address,
    utm_source,
  } = req.body;

  const requiredFields = {
    mobile,
  };

  const missingFields = await missingFieldsChecker(requiredFields);

  if (missingFields?.length > 0) {
    return res.status(400).json({
      message: `The missing fields are  ${missingFields.join(", ")} `,
    });
  }

  const registered_date = dayjs().format("YYYY-MM-DD hh:mm:ss");

  try {
    await createMirrabuildersRegisterService(
      name ? name : null,
      mobile ? mobile : null,
      interest_green_building ? interest_green_building : null,
      plot_build ? plot_build : null,
      budget ? budget : null,
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

export const getAllMirrabuildersRegisterController = async (req, res) => {
  try {
    const response = await getAllMirrabuildersRegisterService();

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

export const getByIdMirrabuildersRegisterController = async (req, res) => {
  const { id } = req.params;

  try {
    const response = await getByIdMirrabuildersRegisterService(id);

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

export const deleteByIdMirrabuildersRegisterController = async (req, res) => {
  const { id } = req.params;

  try {
    await deleteByIdMirrabuildersRegisterService(id);

    return res.status(200).json({
      message: "Data removed successfully",
    });
  } catch (err) {
    return req.status(500).json({
      message: err?.message,
    });
  }
};
