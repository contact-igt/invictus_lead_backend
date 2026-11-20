import cron from "node-cron";
import nodemailer from "nodemailer";
import { Op } from "sequelize";
import db from "../../database/index.js";
import { buildNeyaniAppointmentEmail } from "./neyani.email.js";

const SHEET_WEBHOOK_URL =
  "https://script.google.com/macros/s/AKfycbzjstMz6fNmetq5cOrl14-GDdRlCvUP2ba01rQcggJdtvuupXWIS6LVdyq8AwTG2ms5xw/exec";

const due = (now) => ({
  [Op.or]: [{ sheet_status: { [Op.ne]: "synced" } }, { email_status: { [Op.ne]: "sent" } }],
  next_attempt_at: { [Op.lte]: now },
});
const retryAt = (attempts) => new Date(Date.now() + Math.min(60000 * 2 ** (attempts - 1), 3600000));

export async function deliverNeyaniLead(lead, { fetchSheet = fetch, mail } = {}) {
  const env = process.env;
  const attempts = lead.attempts + 1;
  const [claimed] = await db.NeyaniLead.update(
    { next_attempt_at: new Date(Date.now() + 120000), attempts },
    { where: { id: lead.id, attempts: lead.attempts, ...due(new Date()) } },
  );
  if (!claimed) return;

  let failed = false;
  if (lead.sheet_status !== "synced") {
    try {
      const response = await fetchSheet(SHEET_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          requestId: lead.request_id,
          leadId: lead.id, timestamp: lead.createdAt.toISOString(),
          name: lead.name, phone: lead.phone, treatment: lead.treatment,
          message: lead.message, source: lead.source,
        }),
      });
      if (!response.ok) throw new Error("Sheets webhook HTTP " + response.status);
      const contentType = response.headers.get("content-type") ?? "";
      const result = await response.json().catch(() => null);
      if (result?.success === false ||
          (result?.success !== true && result?.result !== "success" && result?.status !== "success")) {
        const reason = ["missing_spreadsheet_id", "invalid_request", "write_failed"].includes(result?.code)
          ? result.code
          : result?.success === false ? "script rejected the request"
          : contentType.includes("text/html") ? "received HTML instead of JSON"
          : "missing JSON success acknowledgment";
        throw new Error("Sheets webhook did not confirm the write: " + reason);
      }
      await lead.update({ sheet_status: "synced" });
    } catch (error) {
      failed = true;
      await lead.update({ sheet_status: "failed" });
      console.error("[Neyani] sheet delivery failed", { leadId: lead.id, reason: error.message });
    }
  }

  if (lead.email_status !== "sent") {
    try {
      const user = env.NEYANI_SMTP_USER;
      const pass = env.NEYANI_SMTP_APP_PASSWORD?.replace(/\s/g, "");
      const to = env.NEYANI_HOSPITAL_EMAIL;
      if (!user || !pass || !to) throw new Error("SMTP configuration missing");
      const transport = mail ?? nodemailer.createTransport({
        host: "smtp.gmail.com", port: 465, secure: true,
        auth: { user, pass }, connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
      });
      const result = await transport.sendMail({
        from: user,
        to,
        ...buildNeyaniAppointmentEmail(lead),
        messageId: "<neyani-appointment-" + lead.request_id + "@gmail.com>",
      });
      if (!result.accepted.length || result.rejected.length) throw new Error("SMTP recipient rejected");
      await lead.update({ email_status: "sent" });
    } catch (error) {
      failed = true;
      await lead.update({ email_status: "failed" });
      console.error("[Neyani] email delivery failed", { leadId: lead.id, code: error.code, responseCode: error.responseCode });
    }
  }
  if (failed) await lead.update({ next_attempt_at: retryAt(attempts) });
}

export function startNeyaniDeliveryScheduler() {
  cron.schedule("* * * * *", async () => {
    try {
      const leads = await db.NeyaniLead.findAll({
        where: due(new Date()), limit: 25, order: [["next_attempt_at", "ASC"]],
      });
      for (const lead of leads) await deliverNeyaniLead(lead);
    } catch {
      console.error("[Neyani] Delivery worker failed");
    }
  }, { noOverlap: true });
}
