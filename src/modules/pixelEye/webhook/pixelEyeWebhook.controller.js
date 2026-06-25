import { processPixelEyeWebhook } from "./pixelEyeWebhook.service.js";
import { getPixelEyeLead } from "../pixelEye.service.js";

const resolveWebhookErrorStatus = (error) => {
  if (error?.statusCode) {
    return error.statusCode;
  }

  const message = String(error?.message || "").toLowerCase();
  if (message.includes("validation")) return 400;
  if (message.includes("duplicate")) return 409;

  return 500;
};

export const createPixelEyeWebhook = async (req, res) => {
  try {
    const result = await processPixelEyeWebhook(req.webhookPayload);
    const responseLead =
      result?.lead?.id && result?.lead?.client_id
        ? await getPixelEyeLead(result.lead.id, {
            clientId: result.lead.client_id,
            role: "user",
          })
        : result.lead;

    const responsePayload = {
      success: true,
      message: "Webhook processed successfully",
      action: result.action,
      result: result.resultCode || result.skipped || null,
      data: {
        id: responseLead.id,
        call_id: responseLead.call_id,
        followup_highlight_state: responseLead.followup_highlight_state || null,
        called_outcome_missing: Boolean(responseLead.called_outcome_missing),
        compliance_status: responseLead.compliance_status || null,
        normal_lead_attention_state:
          result.normal_lead_attention_state ||
          responseLead.normal_lead_attention_state ||
          null,
        normal_lead_attention_label:
          result.normal_lead_attention_label ||
          responseLead.normal_lead_attention_label ||
          null,
        needs_manual_day_outcome: Boolean(
          result.needs_manual_day_outcome ||
          responseLead.needs_manual_day_outcome,
        ),
      },
    };

    console.log("[PixelEyeWebhookAPI][SUCCESS] webhook processed", {
      call_id: responsePayload.data.call_id,
      action: responsePayload.action,
      result: responsePayload.result,
      followup_highlight_state: responsePayload.data.followup_highlight_state,
      called_outcome_missing: responsePayload.data.called_outcome_missing,
      compliance_status: responsePayload.data.compliance_status,
      normal_lead_attention_state:
        responsePayload.data.normal_lead_attention_state,
      needs_manual_day_outcome: responsePayload.data.needs_manual_day_outcome,
    });

    return res.status(200).json(responsePayload);
  } catch (error) {
    const status = resolveWebhookErrorStatus(error);
    const responsePayload = {
      success: false,
      message: error?.message || "Webhook processing failed",
      action: null,
      result: null,
      data: null,
    };

    console.error("[PixelEyeWebhookAPI][ERROR] webhook processing failed", {
      status,
      call_id: req?.webhookPayload?.call_id || null,
      message: responsePayload.message,
    });

    return res.status(status).json(responsePayload);
  }
};
