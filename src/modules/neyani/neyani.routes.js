import express from "express";
import Joi from "joi";
import db from "../../database/index.js";
import { authenticateToken } from "../../middlewares/auth/authMiddlewares.js";
import { attachTenantContext } from "../../middlewares/auth/tenantMiddleware.js";
import { resolvePublicTenantForModule } from "../../middlewares/auth/publicTenantMiddleware.js";
import { resolveClientId } from "../../utils/resolveClientContext.js";

const router = express.Router();
const intakeSchema = Joi.object({
  requestId: Joi.string().guid({ version: "uuidv4" }).required(),
  name: Joi.string().trim().max(150).required(),
  phone: Joi.string().trim().pattern(/^\+?[\d ()-]{7,19}$/).required(),
  treatment: Joi.string().trim().max(150).allow("", null),
  message: Joi.string().trim().max(2000).allow("", null),
  source: Joi.string().valid("Homepage Contact Section", "Contact Page").required(),
});

router.post("/website/register", resolvePublicTenantForModule("neyani"), async (req, res, next) => {
  const { error, value } = intakeSchema.validate(req.body);
  if (error || value.phone.replace(/\D/g, "").length < 7) {
    return res.status(400).json({ success: false });
  }
  const { requestId, ...fields } = value;
  try {
    const [lead, created] = await db.NeyaniLead.findOrCreate({
      where: { client_id: req.publicTenantId, request_id: requestId },
      defaults: fields,
    });
    return res.status(created ? 201 : 200).json({ success: true, id: lead.id });
  } catch (error) {
    return next(error);
  }
});

router.get("/", authenticateToken, attachTenantContext, async (req, res, next) => {
  try {
    const clientId = await resolveClientId({
      tenant: req.tenant, requestedClientKey: req.query._client_key, expectedModuleKey: "neyani",
    });
    const data = await db.NeyaniLead.findAll({
      where: { client_id: clientId },
      attributes: ["id", "name", "phone", "treatment", "message", "source", "sheet_status", "email_status", "createdAt"],
      order: [["createdAt", "DESC"], ["id", "DESC"]],
    });
    return res.json({ success: true, data });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    return next(error);
  }
});

export default router;
