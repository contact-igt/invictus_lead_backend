import dayjs from "dayjs";
import { missingFieldsChecker } from "../../utils/missingFieldChecker.js";
import {
  createInvictusmetaRegisterService,
  deleteByIdInvictusmetaRegisterService,
  getAllInvictusmetaRegisterService,
  getByIdInvictusmetaRegisterService,
} from "./invictusmeta.service.js";

export const createInvictusmetaRegisterController = async (req, res) => {
  const {
    name,
    mobile,
    business_name,
    bussiness_belongs,
    monthly_ad_budget,
    primary_goal_metads,
    metaad_run_before,
    package_interested,
    planning_to_start,
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
    await createInvictusmetaRegisterService(
      name ? name : null,
      mobile ? mobile : null,
      business_name ? business_name : null,
      bussiness_belongs ? bussiness_belongs : null,
      monthly_ad_budget ? monthly_ad_budget : null,
      primary_goal_metads ? primary_goal_metads : null,
      metaad_run_before ? metaad_run_before : "no",
      package_interested ? package_interested : null,
      planning_to_start ? planning_to_start : null,
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

export const getAllInvictusmetaRegisterController = async (req, res) => {
  try {
    const response = await getAllInvictusmetaRegisterService();

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

export const getByIdInvictusmetaRegisterController = async (req, res) => {
  const { id } = req.params;

  try {
    const response = await getByIdInvictusmetaRegisterService(id);

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

export const deleteByIdInvictusmetaRegisterController = async (req, res) => {
  const { id } = req.params;

  try {
    await deleteByIdInvictusmetaRegisterService(id);

    return res.status(200).json({
      message: "Data removed successfully",
    });
  } catch (err) {
    return req.status(500).json({
      message: err?.message,
    });
  }
};
