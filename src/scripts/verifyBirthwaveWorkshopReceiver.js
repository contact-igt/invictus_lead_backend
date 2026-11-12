import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { buildSheetPayload } from "../modules/birthwave/birthwaveSheetSync.service.js";

const source = readFileSync(new URL("../../apps-script/birthwave-workshop/Code.gs", import.meta.url), "utf8");
const message = "Registration status: registered\nPregnancy stage: second trimester\nWorkshop session: Sunday, Dec 6th, 2026";
const payload = buildSheetPayload({
  id: 181, external_lead_id: "workshop-test-181", source_key: "birthwave_workshop",
  name: "Test registration", phone: "9999999999", service: "All-in-One Prenatal Workshop", message,
});
assert.equal(payload.registration_status, "registered");
assert.equal(payload["Registration Status"], "REGISTERED");
assert.equal(payload["Lead ID"], payload.lead_id);
assert.equal(payload["Submission ID"], payload.submission_id);
assert.equal(payload["Questions / Message"], "");
assert.equal(payload.message, "");
const blank = buildSheetPayload({ message: "Pregnancy stage:\nWorkshop session:\nRegistration status: waitlist" });
assert.equal(blank.stage, "");
assert.equal(blank.workshop_date, "");

function receiver(headers, missingSheet = false) {
  let createdSheets = 0;
  const rows = headers.length ? [[...headers]] : [];
  const sheet = {
    getLastRow: () => rows.length, getLastColumn: () => rows[0]?.length || 0,
    setFrozenRows() {},
    getRange(row, column, height, width) {
      const range = {
        getValues: () => [rows[row - 1].slice(column - 1, column - 1 + width)],
        setValues(values) { rows[row - 1] = Array.from(values[0]); return range; },
        setFontWeight: () => range, setBackground: () => range,
        setFontColor: () => range, setNumberFormat: () => range,
        createTextFinder(needle) {
          const finder = {
            matchEntireCell: () => finder, useRegularExpression: () => finder,
            findNext: () => rows.slice(row - 1, row - 1 + height).some((entry) => entry[column - 1] === needle) ? {} : null,
          };
          return finder;
        },
      };
      return range;
    },
  };
  const context = vm.createContext({
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName(name) { assert.equal(name, "Sheet1"); return missingSheet ? null : sheet; },
        insertSheet() { createdSheets++; throw new Error("Creating tabs is forbidden."); },
      }),
      flush() {},
    },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (text) => ({ setMimeType: () => JSON.parse(text) }) },
  });
  vm.runInContext(source, context);
  return { rows, createdSheets: () => createdSheets, get: () => context.doGet(), post: (body) => context.doPost({ postData: { contents: JSON.stringify(body) } }) };
}

const legacy = ["Timestamp", "Name", "Phone", "Email", "Pregnancy Stage", "Workshop Date", "Questions / Message", "Service", "Lead ID", "Submission ID", "Consent"];
for (const headers of [[], legacy, [...legacy].reverse()]) {
  const { rows, post, createdSheets, get } = receiver(headers);
  assert.equal(post(payload).success, true);
  const read = (header) => rows[1][rows[0].indexOf(header)];
  assert.equal(read("Workshop Date"), "Sunday, Dec 6th, 2026");
  assert.equal(read("Questions / Message"), "");
  assert.equal(read("Service"), payload.service);
  assert.equal(read("Lead ID"), payload.lead_id);
  assert.equal(read("Submission ID"), payload.submission_id);
  assert.equal(read("Registration Status"), "REGISTERED");
  assert.equal(read("Pregnancy Stage"), "second trimester");
  assert.equal(post(payload).duplicate, true);
  assert.equal(rows.length, 2);
  assert.equal(createdSheets(), 0);
  assert.equal(get().version, "sheet1-only-v2");
  assert.equal(get().sheet, "Sheet1");
  assert.equal(get().creates_sheets, false);
}
const invalid = receiver(["Name", "Name"]);
assert.equal(invalid.post(payload).success, false);
assert.equal(invalid.rows.length, 1);
const missing = receiver([], true);
const missingResult = missing.post(payload);
assert.equal(missingResult.success, false);
assert.match(missingResult.error, /Sheet1.*not found/);
assert.equal(missing.rows.length, 0);
assert.equal(missing.createdSheets(), 0);
const question = "Can my partner attend?\nWorkshop session: please explain the schedule.";
const fullMessage = message + "\nQuestions / Message:\n" + question;
const questionPayload = buildSheetPayload({ source_key: "birthwave_workshop", message: fullMessage });
assert.equal(questionPayload.message, question);
assert.equal(questionPayload["Questions / Message"], question);
assert.equal(questionPayload.stage, "second trimester");
assert.equal(questionPayload.workshop_date, "Sunday, Dec 6th, 2026");
assert.equal(buildSheetPayload({ source_key: "birthwave_website", message: fullMessage }).message, fullMessage);
for (const raw of [message, fullMessage, "A plain question\nwith a second line"]) {
  const api = receiver([]);
  assert.equal(api.post({ ...payload, message: raw }).success, true);
  const expected = raw === message ? "" : raw === fullMessage ? question : raw;
  assert.equal(api.rows[1][api.rows[0].indexOf("Questions / Message")], expected);
}
console.log("Birthwave workshop receiver verification passed: Sheet1 only, zero tabs created (including missing Sheet1), legacy/reordered headers, duplicate retries and blank fields.");
