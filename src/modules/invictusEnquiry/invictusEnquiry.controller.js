import {
  createGeneralEnquiryPublic,
  listGeneralEnquiries,
  updateGeneralEnquiry,
  createCareersApplicationPublic,
  listCareersApplications,
  updateCareersApplication,
  exportCareersApplicationsCSV,
  deleteGeneralEnquiry,
  deleteCareersApplication,
} from "./invictusEnquiry.service.js";

// --- PUBLIC SUBMISSION CONTROLLERS ---

export const postGeneralEnquiryPublic = async (req, res, next) => {
  try {
    const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const data = await createGeneralEnquiryPublic(req.body, clientIp);
    return res.status(201).json({
      success: true,
      message: "General enquiry submitted successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const postCareersApplicationPublic = async (req, res, next) => {
  try {
    const data = await createCareersApplicationPublic(req.body);
    return res.status(201).json({
      success: true,
      message: "Careers application submitted successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

// --- ADMIN MANAGEMENT CONTROLLERS ---

export const getGeneralEnquiries = async (req, res, next) => {
  try {
    const result = await listGeneralEnquiries(req.query);
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    return next(error);
  }
};

export const patchGeneralEnquiry = async (req, res, next) => {
  try {
    const data = await updateGeneralEnquiry(req.params.id, req.body);
    return res.status(200).json({
      success: true,
      message: "General enquiry updated successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const getCareersApplications = async (req, res, next) => {
  try {
    const result = await listCareersApplications(req.query);
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    return next(error);
  }
};

export const patchCareersApplication = async (req, res, next) => {
  try {
    const data = await updateCareersApplication(req.params.id, req.body);
    return res.status(200).json({
      success: true,
      message: "Careers application updated successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

// CSV Export Controller for Careers Applications
export const exportCareersApplications = async (req, res, next) => {
  try {
    const csvContent = await exportCareersApplicationsCSV(req.query);
    const filename = `invictus_careers_applications_${new Date().toISOString().split("T")[0]}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    return res.status(200).send(csvContent);
  } catch (error) {
    return next(error);
  }
};

export const removeGeneralEnquiry = async (req, res, next) => {
  try {
    const result = await deleteGeneralEnquiry(req.params.id);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

export const removeCareersApplication = async (req, res, next) => {
  try {
    const result = await deleteCareersApplication(req.params.id);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};
