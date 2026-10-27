import express from "express";
import { authenticateToken, authorizeManagementRole } from "../../middlewares/auth/authMiddlewares.js";
import { attachTenantContext } from "../../middlewares/auth/tenantMiddleware.js";
import { scopeSuperAdminToClient } from "../../middlewares/auth/clientContextMiddleware.js";
import { resolvePublicTenantForModule } from "../../middlewares/auth/publicTenantMiddleware.js";
import { createOculoplastyLead, listOculoplastyLeads, retryOculoplastySheetSync } from "../namokarOculoplasty/namokarOculoplasty.service.js";
const router = express.Router();
// The live Namokar site still posts its contact form to this legacy URL. Store
// those submissions in the Oculoplasty pipeline so the admin screen and sheet
// sync use the same record instead of silently splitting leads between tables.
const liveFormInput = (body = {}) => ({
  ...body,
  submission_id: body.submission_id || body.submissionId,
  form_name: body.form_name || body.formId,
  page_url: body.page_url || body.pageUrl,
});
router.post("/website-leads", resolvePublicTenantForModule("namokar"), async (req,res,next) => { try { if (req.body?.consent !== true) { const error = new Error("Consent is required"); error.status = 422; throw error; } const { row, created } = await createOculoplastyLead(req.publicTenantId, liveFormInput(req.body)); res.status(created ? 201 : 200).json({ success: true, duplicate: !created, id: row.id }); } catch(e) { next(e); } });
router.get("/website-leads", authenticateToken, attachTenantContext, scopeSuperAdminToClient("namokar"), async (req,res,next) => { try { const result = await listOculoplastyLeads(req.tenant.id, { ...req.query, limit: 200 }); res.json({ success: true, data: result.rows }); } catch(e) { next(e); } });
router.post("/website-leads/:id/retry-delivery", authenticateToken, attachTenantContext, scopeSuperAdminToClient("namokar"), authorizeManagementRole, async (req,res,next) => { try { const id = Number(req.params.id); if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "invalid_lead_id" }); res.json({ success: true, data: await retryOculoplastySheetSync(req.tenant.id, id) }); } catch(e) { next(e); } });
export default router;
