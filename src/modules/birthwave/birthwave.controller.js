import {
  listDoctors,
  createDoctor,
  updateDoctor,
  listLeads,
  getLeadById,
  createLead,
  updateLead,
  listAppointments,
  createAppointment,
  updateAppointment,
  getDashboard,
} from "./birthwave.service.js";
import { addBirthwaveLeadNote, getLeadTimeline } from "./birthwaveActivity.service.js";
import { getDispositionOptions, listLeadOutcomes } from "./birthwaveOutcome.service.js";
import {
  createWebsiteLead,
  listWebsiteLeads,
  getWebsiteLead,
  updateWebsiteLead,
  deleteWebsiteLead,
  retryWebsiteLeadSheetSync,
  retryFailedWebsiteLeadSheetSyncs,
  promoteWebsiteLead,
  getWebsiteLeadSourceCounts,
} from "./birthwaveWebsiteLead.service.js";

export const getDashboardHandler = async (req, res, next) => {
  try {
    const data = await getDashboard(req.tenant, req.query, req.user);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

// ── Doctors ──
export const getDoctorsHandler = async (req, res, next) => {
  try {
    const data = await listDoctors(req.tenant, req.query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const createDoctorHandler = async (req, res, next) => {
  try {
    const data = await createDoctor(req.tenant, req.body);
    return res.status(201).json({ success: true, message: "Doctor added", data });
  } catch (error) {
    return next(error);
  }
};

export const updateDoctorHandler = async (req, res, next) => {
  try {
    const data = await updateDoctor(req.tenant, req.params.id, req.body);
    return res.status(200).json({ success: true, message: "Doctor updated", data });
  } catch (error) {
    return next(error);
  }
};

// ── Leads ──
export const getLeadsHandler = async (req, res, next) => {
  try {
    const result = await listLeads(req.tenant, req.query, req.user);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
};

export const getLeadHandler = async (req, res, next) => {
  try {
    const data = await getLeadById(req.tenant, req.params.id, req.user);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const getLeadTimelineHandler = async (req, res, next) => {
  try {
    await getLeadById(req.tenant, req.params.id, req.user);
    const data = await getLeadTimeline(req.tenant.id, Number(req.params.id));
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const createLeadHandler = async (req, res, next) => {
  try {
    const data = await createLead(req.tenant, req.body, req.user);
    return res.status(201).json({ success: true, message: "Lead added", data });
  } catch (error) {
    return next(error);
  }
};

export const updateLeadHandler = async (req, res, next) => {
  try {
    const data = await updateLead(req.tenant, req.params.id, req.body, req.user);
    return res.status(200).json({ success: true, message: "Lead updated", data });
  } catch (error) {
    return next(error);
  }
};

export const addLeadNoteHandler = async (req, res, next) => {
  try {
    const lead = await getLeadById(req.tenant, req.params.id, req.user);
    if (!['super-admin', 'admin', 'client'].includes(String(req.user?.role || '').toLowerCase()) && lead.current_owner_id !== Number(req.user?.id)) {
      return res.status(403).json({ success: false, message: 'Telecallers can only add notes to their assigned Leads' });
    }
    const data = await addBirthwaveLeadNote({
      clientId: req.tenant.id,
      leadId: Number(req.params.id),
      actor: req.user,
      note: req.body.note,
    });
    return res.status(201).json({ success: true, message: "Note added", data });
  } catch (error) {
    return next(error);
  }
};

export const getDispositionOptionsHandler = async (req, res, next) => {
  try { return res.status(200).json({ success: true, data: getDispositionOptions() }); } catch (error) { return next(error); }
};

export const listLeadOutcomesHandler = async (req, res, next) => {
  try { return res.status(200).json({ success: true, data: await listLeadOutcomes(req.tenant, req.params.id, req.user) }); } catch (error) { return next(error); }
};

// ── Appointments ──
export const getAppointmentsHandler = async (req, res, next) => {
  try {
    const result = await listAppointments(req.tenant, req.query);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
};

export const createAppointmentHandler = async (req, res, next) => {
  try {
    const data = await createAppointment(req.tenant, req.body, req.user);
    return res.status(201).json({ success: true, message: "Appointment created", data });
  } catch (error) {
    return next(error);
  }
};

export const updateAppointmentHandler = async (req, res, next) => {
  try {
    const data = await updateAppointment(req.tenant, req.params.id, req.body, req.user);
    return res.status(200).json({ success: true, message: "Appointment updated", data });
  } catch (error) {
    return next(error);
  }
};

// ── Website / landing-page leads ──
export const postWebsiteLeadPublicHandler = async (req, res, next) => {
  try {
    // Normalise IPv4-mapped IPv6 (::ffff:1.2.3.4) and loopback noise.
    const cleanIp = (value) => {
      const ip = String(value || "").trim().replace(/^::ffff:/i, "");
      if (!ip || ip === "::1" || ip === "127.0.0.1") return null;
      return ip;
    };
    const forwardedIp = cleanIp((req.headers["x-forwarded-for"] || "").split(",")[0]);
    const socketIp = cleanIp(req.socket?.remoteAddress);
    // The site's client-side IP lookup (ipify etc.) is the source of truth;
    // the proxy header / socket is only a fallback.
    const data = await createWebsiteLead(req.publicTenantId, {
      ...req.body,
      _idempotency_key: req.headers["idempotency-key"] || req.headers["x-idempotency-key"] || null,
      ip_address: cleanIp(req.body.ip_address) || forwardedIp || socketIp || null,
    });
    return res.status(data.duplicate ? 200 : 201).json({
      success: true,
      message: data.duplicate ? "Enquiry already received" : "Enquiry received",
      ...data,
    });
  } catch (error) {
    return next(error);
  }
};

export const getWebsiteLeadsHandler = async (req, res, next) => {
  try {
    const result = await listWebsiteLeads(req.tenant.id, req.query);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
};

export const getWebsiteLeadSourcesHandler = async (req, res, next) => {
  try {
    const data = await getWebsiteLeadSourceCounts(req.tenant.id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const getWebsiteLeadHandler = async (req, res, next) => {
  try {
    const data = await getWebsiteLead(req.tenant.id, req.params.id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const updateWebsiteLeadHandler = async (req, res, next) => {
  try {
    const data = await updateWebsiteLead(req.tenant.id, req.params.id, req.body);
    return res.status(200).json({ success: true, message: "Website lead updated", data });
  } catch (error) {
    return next(error);
  }
};

export const deleteWebsiteLeadHandler = async (req, res, next) => {
  try {
    const data = await deleteWebsiteLead(req.tenant.id, req.params.id);
    return res.status(200).json({ success: true, message: "Website lead deleted", ...data });
  } catch (error) {
    return next(error);
  }
};

export const retryWebsiteLeadSheetSyncHandler = async (req, res, next) => {
  try {
    const data = await retryWebsiteLeadSheetSync(req.tenant.id, req.params.id);
    return res.status(200).json({ success: true, message: "Sheet sync retried", data });
  } catch (error) {
    return next(error);
  }
};

export const retryFailedWebsiteLeadSheetSyncsHandler = async (req, res, next) => {
  try {
    const data = await retryFailedWebsiteLeadSheetSyncs(req.tenant.id, req.query.source_key);
    return res.status(200).json({ success: true, message: "Sheet syncs re-queued", ...data });
  } catch (error) {
    return next(error);
  }
};

export const promoteWebsiteLeadHandler = async (req, res, next) => {
  try {
    const data = await promoteWebsiteLead(req.tenant.id, req.params.id, req.user);
    return res.status(200).json({ success: true, message: "Lead promoted", data });
  } catch (error) {
    return next(error);
  }
};
