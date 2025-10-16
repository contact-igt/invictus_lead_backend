import dayjs from "dayjs";
import { missingFieldsChecker } from "../../utils/missingFieldChecker.js";
import {
  createNetralyaRegisterService,
  deleteByIdNetralyaRegisterService,
  findNetralyaRegisterUserService,
  getAllNetralyaRegisterService,
  getByIdNetralyaRegisterService,
  updateNetralyaRegistereUserService,
} from "./netralaya.service.js";

export const createNetralyaRegisterController = async (req, res) => {
  const { name, mobile, ip_address, utm_source, page_name } = req.body;

  const requiredFields = {
    mobile,
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
    const alreadyRegister = await findNetralyaRegisterUserService(
      mobile,
      page_name
    );

    if (!alreadyRegister) {
      await createNetralyaRegisterService(
        name ? name : null,
        mobile ? mobile : null,
        ip_address ? ip_address : null,
        utm_source ? utm_source : null,
        page_name,
        1,
        registered_date
      );
    } else {
      const new_enquiryCount = Number(alreadyRegister?.enquiry_count) + 1;

      await updateNetralyaRegistereUserService(
        new_enquiryCount,
        registered_date,
        mobile,
        page_name
      );
    }

    return res.status(200).json({
      message: "Registered successfully",
    });
  } catch (err) {
    return res.status(500).json({
      message: err?.message,
    });
  }
};

export const getAllNetralyaRegisterController = async (req, res) => {
  try {
    const response = await getAllNetralyaRegisterService();

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

export const getByIdNetralyaRegisterController = async (req, res) => {
  const { id } = req.params;

  try {
    const response = await getByIdNetralyaRegisterService(id);

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

export const deleteByIdNetralyaRegisterController = async (req, res) => {
  const { id } = req.params;

  try {
    await deleteByIdNetralyaRegisterService(id);

    return res.status(200).json({
      message: "Data removed successfully",
    });
  } catch (err) {
    return req.status(500).json({
      message: err?.message,
    });
  }
};
