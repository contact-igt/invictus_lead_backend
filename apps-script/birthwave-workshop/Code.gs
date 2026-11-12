/** The Birthwave — registration receiver. No payment fields are accepted or written. */
var WORKSHOP_HEADERS = [
  "Timestamp", "Name", "Phone", "Email", "Pregnancy Stage", "Registration Status",
  "Workshop Date", "Questions / Message", "Service", "Lead ID", "Submission ID",
  "Consent", "UTM Source", "UTM Medium", "UTM Campaign", "UTM Content", "UTM Term",
  "Landing Page", "Source"
];

function jsonResponse(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function firstValue(data, keys) {
  for (var i = 0; i < keys.length; i++) {
    var value = data[keys[i]];
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return "";
}

// Prevent user-provided values from being interpreted as spreadsheet formulas.
function plainText(value) {
  var text = value === undefined || value === null ? "" : String(value);
  return /^[\s]*[=+\-@]/.test(text) ? "'" + text : text;
}

function messageField(message, label) {
  var match = message.match(new RegExp("^" + label + ":[ \\t]*([^\\r\\n]+)", "im"));
  return match ? match[1].trim() : "";
}

function questionMessage(message) {
  return message.replace(/^(?:(?:Registration status|Pregnancy stage|Workshop session):[^\r\n]*(?:\r?\n|$))+/i, "")
    .replace(/^\s*Questions\s*\/\s*Message:[ \t]*(?:\r?\n)?/i, "").trim();
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  var locked = false;
  try {
    var data;
    if (e && e.postData && e.postData.contents) {
      try { data = JSON.parse(e.postData.contents); }
      catch (error) { data = e.parameter; }
    } else { data = e && e.parameter; }
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid registration payload.");

    if (data.source_key && data.source_key !== "birthwave_workshop") throw new Error("Invalid registration source.");
    var leadId = firstValue(data, ["lead_id", "external_lead_id", "Lead ID"]);
    var submissionId = firstValue(data, ["submission_id", "external_submission_id", "Submission ID"]) || leadId;
    var name = firstValue(data, ["name", "Name"]);
    var phone = firstValue(data, ["phone", "Phone", "mobile"]);
    if (!leadId || !submissionId || !name || !phone) throw new Error("Missing registration identifiers or contact fields.");

    locked = lock.tryLock(10000);
    if (!locked) throw new Error("Registration receiver is busy. Retry the same submission.");
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName("Sheet1");
    if (!sheet) throw new Error('Required sheet "Sheet1" was not found. No new sheet was created.');
    var headers = sheet.getLastRow() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (header) { return String(header).trim(); }) : [];
    var seenHeaders = {};
    headers.forEach(function (header) {
      if (header && seenHeaders[header]) throw new Error("Duplicate sheet header: " + header + ". Fix the header before retrying.");
      if (header) seenHeaders[header] = true;
    });
    WORKSHOP_HEADERS.forEach(function (header) { if (headers.indexOf(header) === -1) headers.push(header); });
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#F4ECE6").setFontColor("#3A2B27");
    sheet.setFrozenRows(1);

    // Match exact identifiers while holding the lock; retries cannot append duplicate rows.
    if (sheet.getLastRow() > 1) {
      var identifiers = [["Submission ID", submissionId], ["Lead ID", leadId]];
      for (var k = 0; k < identifiers.length; k++) {
        var column = headers.indexOf(identifiers[k][0]) + 1;
        var existing = sheet.getRange(2, column, sheet.getLastRow() - 1, 1)
          .createTextFinder(identifiers[k][1]).matchEntireCell(true).useRegularExpression(false).findNext();
        if (existing) return jsonResponse({ success: true, duplicate: true, lead_id: leadId });
      }
    }

    var message = firstValue(data, ["message", "Message", "Questions / Message"]);
    var attribution = data.attribution || {};
    var status = (firstValue(data, ["registration_status", "Registration Status"]) || messageField(message, "Registration status")).toLowerCase();
    var row = {
      "Timestamp": firstValue(data, ["timestamp", "created_at", "submitted_at", "Timestamp"]) || new Date(),
      "Name": name,
      "Phone": phone,
      "Email": firstValue(data, ["email", "Email"]),
      "Pregnancy Stage": firstValue(data, ["stage", "pregnancy_stage", "Pregnancy Stage"]) || messageField(message, "Pregnancy stage"),
      "Registration Status": status === "registered" || status === "waitlist" ? status.toUpperCase() : "",
      "Workshop Date": firstValue(data, ["workshop_date", "programm_date", "Workshop Date"]) || messageField(message, "Workshop session"),
      "Questions / Message": questionMessage(message),
      "Service": firstValue(data, ["service", "Service"]) || "All-in-One Prenatal Workshop",
      "Lead ID": leadId,
      "Submission ID": submissionId,
      "Consent": data.consent === true ? "Yes" : data.consent === false ? "No" : firstValue(data, ["Consent"]),
      "UTM Source": attribution.utm_source || firstValue(data, ["utm_source", "UTM Source"]),
      "UTM Medium": attribution.utm_medium || firstValue(data, ["utm_medium", "UTM Medium"]),
      "UTM Campaign": attribution.utm_campaign || firstValue(data, ["utm_campaign", "UTM Campaign"]),
      "UTM Content": attribution.utm_content || firstValue(data, ["utm_content", "UTM Content"]),
      "UTM Term": attribution.utm_term || firstValue(data, ["utm_term", "UTM Term"]),
      "Landing Page": attribution.landing_page || firstValue(data, ["landing_page", "Landing Page"]) || "/",
      "Source": firstValue(data, ["source", "Source", "source_key"])
    };
    var nextRow = sheet.getLastRow() + 1;
    var range = sheet.getRange(nextRow, 1, 1, headers.length);
    range.setNumberFormat("@");
    range.setValues([headers.map(function (header) {
      return row[header] instanceof Date ? row[header] : plainText(row[header]);
    })]);
    SpreadsheetApp.flush();
    return jsonResponse({ success: true, message: "Workshop registration recorded successfully", lead_id: leadId });
  } catch (error) {
    return jsonResponse({ success: false, error: String(error.message || error) });
  } finally {
    if (locked) lock.releaseLock();
  }
}

function doGet() {
  return jsonResponse({ status: "active", service: "The Birthwave Workshop Registration Receiver", version: "sheet1-only-v2", sheet: "Sheet1", creates_sheets: false, columns: WORKSHOP_HEADERS.length });
}
