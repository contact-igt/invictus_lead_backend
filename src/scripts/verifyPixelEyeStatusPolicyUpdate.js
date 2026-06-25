import assert from "node:assert/strict";
import {
  DAY_OUTCOME_STATUSES,
  DNP_STATUSES,
  FORTY_EIGHT_HR_STATUSES,
  NO_ACTION_STATUSES,
  NO_REMINDER_STATUSES,
  TERMINATION_STATUSES,
  THIRTY_MIN_STATUSES,
  TWENTY_FOUR_HR_STATUSES,
  getAllowedStatusesForDay,
  getStatusCategory,
  isAllowedStatusForDay,
  isControlledDayOutcomeStatus,
  isTerminalPixelEyeStatus,
  normalizePixelEyeMainStatus,
  normalizePixelEyeOutcomeStatus,
} from "../modules/pixelEye/pixelEyeStatusPolicy.js";

const checks = [];
const record = (name, fn) => checks.push({ name, fn });

record("main status accepts unknown Runo text", () => {
  assert.equal(
    normalizePixelEyeMainStatus("Runo Custom Status 2026"),
    "Runo Custom Status 2026",
  );
});

record("unknown Runo text is not controlled day outcome", () => {
  assert.equal(isControlledDayOutcomeStatus("Runo Custom Status 2026"), false);
  assert.equal(getStatusCategory("Runo Custom Status 2026"), "UNKNOWN");
});

record("new controlled status list has expected exact values", () => {
  assert.deepEqual(DAY_OUTCOME_STATUSES, [
    "Enquiry",
    "Appointment Fixed",
    "Doctor Appointment Fixed",
    "Walk In",
    "Visited",
    "Hot Followup",
    "Followup Post Appointment",
    "Will Call & Take Appointment Later",
    "Not Willing To Come As Of Now",
    "Not Interested",
    "Not Answering",
    "DNP 1",
    "DNP 2",
    "DNP 3",
    "DNP 4",
    "Switch Off",
    "Not In Network",
    "Disconnected",
    "Number Not In Service",
    "Incoming Call Not Available",
    "On Another Call Busy",
    "Wrong Number",
    "Not Speaking",
    "DND",
    "Not In Hospital City",
    "Far From Hospital",
    "Going To Other Hospital",
    "Searching For Specific Hospital",
    "Appointment Cancelled As Per Patient Request",
    "Address Requested",
    "Doctor Time Requested",
    "Want To Speak With Doctor",
    "Medicine Enquiry",
    "Missed Call",
    "Closed",
    "Others",
  ]);
});

record("day 1 allows only DNP 1 among DNP statuses", () => {
  assert.equal(isAllowedStatusForDay("DNP 1", 1), true);
  assert.equal(isAllowedStatusForDay("DNP 2", 1), false);
  assert.equal(isAllowedStatusForDay("DNP 3", 1), false);
  assert.equal(isAllowedStatusForDay("DNP 4", 1), false);
});

record("day 2 allows only DNP 2 among DNP statuses", () => {
  assert.equal(isAllowedStatusForDay("DNP 1", 2), false);
  assert.equal(isAllowedStatusForDay("DNP 2", 2), true);
  assert.equal(isAllowedStatusForDay("DNP 3", 2), false);
  assert.equal(isAllowedStatusForDay("DNP 4", 2), false);
});

record("day 3 allows only DNP 3 among DNP statuses", () => {
  assert.equal(isAllowedStatusForDay("DNP 1", 3), false);
  assert.equal(isAllowedStatusForDay("DNP 2", 3), false);
  assert.equal(isAllowedStatusForDay("DNP 3", 3), true);
  assert.equal(isAllowedStatusForDay("DNP 4", 3), false);
});

record("day 4 allows only DNP 4 among DNP statuses", () => {
  assert.equal(isAllowedStatusForDay("DNP 1", 4), false);
  assert.equal(isAllowedStatusForDay("DNP 2", 4), false);
  assert.equal(isAllowedStatusForDay("DNP 3", 4), false);
  assert.equal(isAllowedStatusForDay("DNP 4", 4), true);
});

record("day 5 excludes DNP and reminder-follow-up statuses", () => {
  const day5 = getAllowedStatusesForDay(5);
  for (const status of [
    ...DNP_STATUSES,
    ...THIRTY_MIN_STATUSES,
    ...TWENTY_FOUR_HR_STATUSES,
    ...FORTY_EIGHT_HR_STATUSES,
  ]) {
    assert.equal(
      day5.includes(status),
      false,
      `${status} should not be day 5 selectable`,
    );
  }
});

record("day 5 allows final and no-reminder statuses", () => {
  const day5 = getAllowedStatusesForDay(5);
  for (const status of [
    ...NO_ACTION_STATUSES,
    ...TERMINATION_STATUSES,
    ...NO_REMINDER_STATUSES,
  ]) {
    assert.equal(
      day5.includes(status),
      true,
      `${status} should be day 5 selectable`,
    );
  }
});

record("reminder category mapping uses new canonical names", () => {
  for (const status of THIRTY_MIN_STATUSES)
    assert.equal(getStatusCategory(status), "THIRTY_MIN", status);
  for (const status of DNP_STATUSES)
    assert.equal(getStatusCategory(status), "DNP2", status);
  for (const status of TWENTY_FOUR_HR_STATUSES)
    assert.equal(getStatusCategory(status), "TWENTY_FOUR_HR", status);
  for (const status of FORTY_EIGHT_HR_STATUSES)
    assert.equal(getStatusCategory(status), "FORTY_EIGHT_HR", status);
  for (const status of NO_REMINDER_STATUSES)
    assert.equal(getStatusCategory(status), "NO_REMINDER", status);
});

record("terminal detection uses new final statuses", () => {
  for (const status of [...NO_ACTION_STATUSES, ...TERMINATION_STATUSES]) {
    assert.equal(isTerminalPixelEyeStatus(status), true, status);
  }
  assert.equal(isTerminalPixelEyeStatus("Enquiry"), false);
});

record(
  "legacy status names normalize without becoming selectable labels",
  () => {
    assert.equal(normalizePixelEyeOutcomeStatus("Dnp 1"), "DNP 1");
    assert.equal(
      normalizePixelEyeOutcomeStatus("Disconnecting"),
      "Disconnected",
    );
    assert.equal(
      normalizePixelEyeOutcomeStatus("Not In Hyderabad"),
      "Not In Hospital City",
    );
    assert.equal(
      normalizePixelEyeOutcomeStatus("Dr Abdul Appointment fixed"),
      "Doctor Appointment Fixed",
    );
    assert.equal(normalizePixelEyeOutcomeStatus("Misscall"), "Missed Call");
  },
);

record("legacy day values validate through canonical day policy", () => {
  assert.equal(isAllowedStatusForDay("Dnp 1", 1), true);
  assert.equal(isAllowedStatusForDay("Dnp 4", 1), false);
  assert.equal(
    isAllowedStatusForDay("Will call & Take Appointment Later", 5),
    false,
  );
});

let passed = 0;
for (const check of checks) {
  try {
    check.fn();
    passed += 1;
    console.log(`PASS ${check.name}`);
  } catch (error) {
    console.error(`FAIL ${check.name}`);
    console.error(error);
    process.exitCode = 1;
    break;
  }
}

if (process.exitCode) {
  console.error(
    `PixelEye status policy verification failed after ${passed}/${checks.length} checks.`,
  );
} else {
  console.log(
    `PixelEye status policy verification passed ${passed}/${checks.length} checks.`,
  );
}
