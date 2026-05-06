import { processPixelEyeWebhook } from "./pixelEyeWebhook.service.js";

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

    const responsePayload = {
      success: true,
      message: "Webhook processed successfully",
      action: result.action,
      data: {
        id: result.lead.id,
        call_id: result.lead.call_id,
      },
    };

    return res.status(200).json(responsePayload);
  } catch (error) {
    const status = resolveWebhookErrorStatus(error);
    const responsePayload = {
      success: false,
      message: error.message || "Webhook processing failed",
    };

    return res.status(status).json(responsePayload);
  }
};
