import assert from "node:assert/strict";
import { buildPixelEyeCallLogOutcomeMarkerPayload } from "../modules/pixelEye/pixelEyeCallLog.service.js";

const firstOutcomeAt = "2026-06-24T09:30:00.000Z";

const firstOutcomeMarkers = buildPixelEyeCallLogOutcomeMarkerPayload({
  outcome_day_number: 1,
  outcome_status: "Enquiry",
  outcome_applied_at: firstOutcomeAt,
});

assert.equal(firstOutcomeMarkers.outcome_day_number, 1);
assert.equal(firstOutcomeMarkers.outcome_status, "Enquiry");
assert.ok(firstOutcomeMarkers.outcome_applied_at instanceof Date);
assert.equal(
  firstOutcomeMarkers.outcome_applied_at.toISOString(),
  firstOutcomeAt,
);

const duplicateWithoutOutcomeMarkers = buildPixelEyeCallLogOutcomeMarkerPayload(
  {
    status: "Enquiry",
    raw_payload: { call_id: "CALL-1" },
  },
);

assert.deepEqual(duplicateWithoutOutcomeMarkers, {});

const duplicateWithExplicitNullMarkers =
  buildPixelEyeCallLogOutcomeMarkerPayload({
    outcome_day_number: null,
    outcome_status: null,
    outcome_applied_at: null,
  });

assert.deepEqual(duplicateWithExplicitNullMarkers, {});

const duplicateWithEmptyMarkers = buildPixelEyeCallLogOutcomeMarkerPayload({
  outcome_day_number: "",
  outcome_status: "",
  outcome_applied_at: "",
});

assert.deepEqual(duplicateWithEmptyMarkers, {});

const existingLogAfterFirstWebhook = {
  outcome_day_number: firstOutcomeMarkers.outcome_day_number,
  outcome_status: firstOutcomeMarkers.outcome_status,
  outcome_applied_at: firstOutcomeMarkers.outcome_applied_at,
};

const existingLogAfterSecondDuplicate = {
  ...existingLogAfterFirstWebhook,
  ...duplicateWithoutOutcomeMarkers,
};

assert.equal(existingLogAfterSecondDuplicate.outcome_day_number, 1);
assert.equal(existingLogAfterSecondDuplicate.outcome_status, "Enquiry");
assert.equal(
  existingLogAfterSecondDuplicate.outcome_applied_at.toISOString(),
  firstOutcomeAt,
);
assert.equal(Boolean(existingLogAfterSecondDuplicate.outcome_applied_at), true);

const thirdDuplicateWouldBeSkipped = Boolean(
  existingLogAfterSecondDuplicate.outcome_applied_at,
);

assert.equal(thirdDuplicateWouldBeSkipped, true);

const createMarkersWithoutOutcome = buildPixelEyeCallLogOutcomeMarkerPayload(
  {},
  { includeNulls: true },
);

assert.deepEqual(createMarkersWithoutOutcome, {
  outcome_day_number: null,
  outcome_status: null,
  outcome_applied_at: null,
});

console.log("PixelEye call-log idempotency marker preservation verified.");
