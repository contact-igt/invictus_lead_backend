import {
  createVlsConsumerProtectionLawMasterClassRegistration,
  createVlsConsumerProtectionLawMasterClassPublicRegistration,
  deleteVlsConsumerProtectionLawMasterClassRegistration,
  exportVlsConsumerProtectionLawMasterClassReport,
  getVlsConsumerProtectionLawMasterClassRegistrationById,
  getVlsConsumerProtectionLawMasterClassSummary,
  listVlsConsumerProtectionLawMasterClassRegistrations,
  updateVlsConsumerProtectionLawMasterClassRegistration,
} from "./vlsConsumerProtectionLawMasterClass.service.js";

export const registerVlsConsumerProtectionLawMasterClassPublicLead = async (req, res, next) => {
  try {
    console.log("\n==========================================");
    console.log("📥 [PUBLIC LANDING PAGE] New Lead Registration Received:");
    console.log("Client Key:", req.headers["x-client-key"] || req.body?.client_key || "N/A");
    console.log("Payload:", JSON.stringify(req.body, null, 2));

    const data = await createVlsConsumerProtectionLawMasterClassPublicRegistration(req.body, req.publicTenantId);

    console.log("✅ [PUBLIC LANDING PAGE] Registration Saved Successfully! Record ID:", data.id);
    console.log("==========================================\n");

    return res.status(201).json({
      success: true,
      message: "Consumer Protection Law Masterclass registration created successfully",
      data,
    });
  } catch (error) {
    console.error("❌ [PUBLIC LANDING PAGE] Registration Failed:", error.message);
    return next(error);
  }
};

export const getVlsConsumerProtectionLawMasterClassRegistrations = async (req, res, next) => {
  try {
    const result = await listVlsConsumerProtectionLawMasterClassRegistrations(req.query, req.tenant);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
};

export const getVlsConsumerProtectionLawMasterClassSummaryMetrics = async (req, res, next) => {
  try {
    const data = await getVlsConsumerProtectionLawMasterClassSummary(req.query, req.tenant);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const exportVlsConsumerProtectionLawMasterClassRegistrations = async (req, res, next) => {
  try {
    const report = await exportVlsConsumerProtectionLawMasterClassReport(req.query, req.tenant);
    res.setHeader("Content-Type", report.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);
    return res.status(200).send(report.buffer);
  } catch (error) {
    return next(error);
  }
};

export const getVlsConsumerProtectionLawMasterClassRegistration = async (req, res, next) => {
  try {
    const data = await getVlsConsumerProtectionLawMasterClassRegistrationById(
      req.params.id,
      req.tenant,
      req.query._client_key
    );
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const createVlsConsumerProtectionLawMasterClassRegistrationRecord = async (req, res, next) => {
  try {
    const data = await createVlsConsumerProtectionLawMasterClassRegistration(
      req.body,
      req.tenant,
      req.query._client_key
    );
    return res.status(201).json({
      success: true,
      message: "Consumer Protection Law Masterclass registration created successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const updateVlsConsumerProtectionLawMasterClassRegistrationRecord = async (req, res, next) => {
  try {
    const data = await updateVlsConsumerProtectionLawMasterClassRegistration(
      req.params.id,
      req.body,
      req.tenant,
      req.query._client_key
    );
    return res.status(200).json({
      success: true,
      message: "Consumer Protection Law Masterclass registration updated successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const deleteVlsConsumerProtectionLawMasterClassRegistrationRecord = async (req, res, next) => {
  try {
    await deleteVlsConsumerProtectionLawMasterClassRegistration(
      req.params.id,
      req.tenant,
      req.query._client_key
    );
    return res.status(200).json({
      success: true,
      message: "Consumer Protection Law Masterclass registration deleted successfully",
    });
  } catch (error) {
    return next(error);
  }
};
