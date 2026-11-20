const timeFormat = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata",
});

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));

export function buildNeyaniAppointmentEmail(lead) {
  const submittedAt = new Date(lead.createdAt ?? NaN);
  const fields = [
    ["Patient name", lead.name],
    ["Phone number", lead.phone],
    ["Treatment / service", lead.treatment],
    ["Submitted at", Number.isNaN(submittedAt.getTime()) ? "" : timeFormat.format(submittedAt) + " IST"],
    ["Source page", lead.source],
    ["Lead ID", lead.id],
  ].map(([label, value]) => [label, String(value ?? "").trim() || "Not provided"]);
  const message = String(lead.message ?? "").trim() || "No message provided.";
  const greeting = "Hello Neyani Appointment Team,";
  const introduction = "A patient has requested an appointment through the Neyani Eye Hospital website.";
  const followUp = "Please call the patient using the number above to discuss their request and confirm a suitable appointment time. You can review this request under Neyani Website Leads in Invictus Admin.";
  const subject = "New Neyani appointment request #" + lead.id;
  const rows = fields.map(([label, value]) => `
    <tr>
      <th scope="row" align="left" valign="top" style="padding:11px 12px 11px 0;border-bottom:1px solid #dceef3;color:#246b82;font-size:14px;font-weight:600;width:38%">${label}</th>
      <td valign="top" style="padding:11px 0;border-bottom:1px solid #dceef3;color:#103746;font-size:15px;overflow-wrap:anywhere">${escapeHtml(value)}</td>
    </tr>`).join("");

  return {
    subject,
    text: ["Neyani Eye Hospital", subject, "", greeting, introduction, "", ...fields.map(([label, value]) => label + ": " + value),
      "", "Appointment message", message, "", followUp].join("\n"),
    html: `<!doctype html>
<html lang="en"><body style="margin:0;padding:0;background:#eef7f9;font-family:Arial,sans-serif;color:#103746">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#eef7f9"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fbfeff;border:1px solid #cbe7ef">
    <tr><td bgcolor="#075f78" style="padding:23px 24px;color:#ffffff">
      <h1 style="margin:0;font-size:26px;line-height:1.25">New appointment request</h1>
    </td></tr>
    <tr><td style="padding:12px 24px 24px">
      <p style="margin:8px 0 14px;color:#39464c;font-size:15px;line-height:1.55">${greeting}<br>${introduction}</p>
      <table width="100%" cellspacing="0" cellpadding="0">${rows}</table>
      <h2 style="margin:24px 0 9px;font-size:17px">Appointment message</h2>
      <div style="padding:14px 16px;background:#eaf6fa;border-left:3px solid #087ea4;font-size:15px;line-height:1.55;overflow-wrap:anywhere">${escapeHtml(message).replace(/\r\n|\r|\n/g, "<br>")}</div>
      <p style="margin:18px 0 0;color:#39464c;font-size:14px;line-height:1.55">${followUp}</p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`,
  };
}
