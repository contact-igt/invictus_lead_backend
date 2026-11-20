function doPost(event) {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty("NEYANI_SPREADSHEET_ID");
  try {
    const data = JSON.parse(event.postData.contents);
    if (!spreadsheetId) return respond_(false, "missing_spreadsheet_id");
    if (typeof data?.requestId !== "string" || !/^[a-f0-9-]{36}$/i.test(data.requestId)) {
      return respond_(false, "invalid_request");
    }
    const lock = LockService.getScriptLock();
    lock.waitLock(5000);
    try {
      const book = SpreadsheetApp.openById(spreadsheetId);
      const sheet = book.getSheetByName("Website Leads") || book.insertSheet("Website Leads");
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(["Request ID", "Lead ID", "Submitted At", "Name", "Phone", "Treatment", "Message", "Source"]);
      }
      const count = sheet.getLastRow() - 1;
      if (count > 0 && sheet.getRange(2, 1, count, 1).createTextFinder(data.requestId).matchEntireCell(true).findNext()) {
        return respond_(true);
      }
      const fields = [data.requestId, data.leadId, data.timestamp, data.name, data.phone, data.treatment, data.message, data.source];
      sheet.appendRow(fields.map(function (value) { return "'" + String(value == null ? "" : value); }));
      SpreadsheetApp.flush();
      return respond_(true);
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    console.error("Neyani Sheets write failed: " + error.name);
    return respond_(false, "write_failed");
  }
}

function respond_(success, code) {
  return ContentService.createTextOutput(JSON.stringify({ success: success, code: code })).setMimeType(ContentService.MimeType.JSON);
}
