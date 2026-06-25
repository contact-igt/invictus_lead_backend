// Shared PixelEye status policy used by backend workflow services.

export const DAY_OUTCOME_STATUSES = Object.freeze([
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

export const LEGACY_DAY_OUTCOME_STATUSES = Object.freeze([
  "Dnp 1",
  "Dnp 2",
  "Dnp 3",
  "Dnp 4",
  "Disconnecting",
  "Not In Hyderabad",
  "Will call & Take Appointment Later",
  "Not Willing To Come as of now",
  "Not interested",
  "Dr Abdul Appointment fixed",
  "Dr Poojita Appointment Fixed",
  "Dr Ar/kp Appointment Fixed",
  "Appointment Cancelled as per patient req",
  "Address",
  "Doctor Time",
  "Baby Playing With Phone",
  "Wrongly Dialed",
  "Fraud Call",
  "Abdul Sir Family-Frnd Call",
  "Long Distance",
  "Misscall",
  "Medicine",
  "-",
  "wrong number",
]);

export const LEGACY_PIXEL_EYE_STATUS_MAP = Object.freeze({
  "Dnp 1": "DNP 1",
  "Dnp 2": "DNP 2",
  "Dnp 3": "DNP 3",
  "Dnp 4": "DNP 4",
  "Switched Off": "Switch Off",
  "Not in Network": "Not In Network",
  Disconnecting: "Disconnected",
  Disconnected: "Disconnected",
  "Not in Hyderabad": "Not In Hospital City",
  "Not In Hyderabad": "Not In Hospital City",
  "Not In Hospital City": "Not In Hospital City",
  "Will call & Take Appointment Later": "Will Call & Take Appointment Later",
  "Will Call & Take Appointment Later": "Will Call & Take Appointment Later",
  "Will Call Later": "Will Call & Take Appointment Later",
  "Not Willing To Come as of now": "Not Willing To Come As Of Now",
  "Not Willing to Come Now": "Not Willing To Come As Of Now",
  "Not Interested": "Not Interested",
  "Not interested": "Not Interested",
  "Hot Follow-up": "Hot Followup",
  Rescheduling: "Hot Followup",
  "Follow-up Required": "Hot Followup",
  "Follow-up Post Appointment": "Followup Post Appointment",
  "Walk-in": "Walk In",
  "Dr Abdul Appointment fixed": "Doctor Appointment Fixed",
  "Dr Poojita Appointment Fixed": "Doctor Appointment Fixed",
  "Dr Ar/kp Appointment Fixed": "Doctor Appointment Fixed",
  "On Another Call": "On Another Call Busy",
  Busy: "On Another Call Busy",
  "Number Not in Service": "Number Not In Service",
  "Wrong Number": "Wrong Number",
  "wrong number": "Wrong Number",
  "Wrongly Dialed": "Wrong Number",
  "Fraud Call": "Wrong Number",
  "Abdul Sir Family-Frnd Call": "Wrong Number",
  "Appointment Cancelled": "Appointment Cancelled As Per Patient Request",
  "Appointment Cancelled as per patient req":
    "Appointment Cancelled As Per Patient Request",
  Address: "Address Requested",
  "Address Requested": "Address Requested",
  "Doctor Time": "Doctor Time Requested",
  "Doctor Time Requested": "Doctor Time Requested",
  "Want to Speak With Doctor": "Want To Speak With Doctor",
  "Searching for Specific Hospital": "Searching For Specific Hospital",
  "Going to Other Hospital": "Going To Other Hospital",
  "Long Distance": "Far From Hospital",
  Misscall: "Missed Call",
  "Missed Call": "Missed Call",
  Medicine: "Medicine Enquiry",
  "Medicine Enquiry": "Medicine Enquiry",
  "Baby Playing With Phone": "Not Speaking",
});

export const THIRTY_MIN_STATUSES = Object.freeze([
  "Switch Off",
  "Not In Network",
  "Disconnected",
  "Not Answering",
  "On Another Call Busy",
  "Incoming Call Not Available",
  "Not Speaking",
  "DND",
  "Missed Call",
]);

export const DNP_STATUSES = Object.freeze(["DNP 1", "DNP 2", "DNP 3", "DNP 4"]);

export const TWENTY_FOUR_HR_STATUSES = Object.freeze([
  "Enquiry",
  "Hot Followup",
  "Others",
  "Followup Post Appointment",
  "Address Requested",
  "Doctor Time Requested",
  "Want To Speak With Doctor",
  "Searching For Specific Hospital",
  "Appointment Cancelled As Per Patient Request",
]);

export const FORTY_EIGHT_HR_STATUSES = Object.freeze([
  "Will Call & Take Appointment Later",
]);

export const NO_REMINDER_STATUSES = Object.freeze(["Medicine Enquiry"]);

export const TERMINATION_STATUSES = Object.freeze([
  "Not In Hospital City",
  "Not Willing To Come As Of Now",
  "Not Interested",
  "Number Not In Service",
  "Wrong Number",
  "Closed",
  "Going To Other Hospital",
  "Far From Hospital",
]);

export const NO_ACTION_STATUSES = Object.freeze([
  "Walk In",
  "Appointment Fixed",
  "Doctor Appointment Fixed",
  "Visited",
]);

export const ALLOWED_SCHEDULE_TYPES = new Set([
  "THIRTY_MIN",
  "DNP2",
  "TWENTY_FOUR_HR",
  "FORTY_EIGHT_HR",
  "MANUAL",
]);

const normalizeLookupKey = (value) =>
  String(value || "")
    .toLowerCase()
    .trim();

const makeLowercaseSet = (values) =>
  new Set(values.map((value) => normalizeLookupKey(value)));

const CANONICAL_STATUS_BY_LOWERCASE = new Map(
  DAY_OUTCOME_STATUSES.map((status) => [normalizeLookupKey(status), status]),
);

const LEGACY_STATUS_BY_LOWERCASE = new Map(
  Object.entries(LEGACY_PIXEL_EYE_STATUS_MAP).map(([legacy, canonical]) => [
    normalizeLookupKey(legacy),
    canonical,
  ]),
);

export const normalizePixelEyeMainStatus = (status) => {
  if (status === undefined || status === null) return status;
  const trimmed = String(status).trim();
  if (!trimmed) return trimmed;
  const lookupKey = normalizeLookupKey(trimmed);
  return (
    CANONICAL_STATUS_BY_LOWERCASE.get(lookupKey) ||
    LEGACY_STATUS_BY_LOWERCASE.get(lookupKey) ||
    trimmed
  );
};

export const normalizePixelEyeOutcomeStatus = (status) =>
  normalizePixelEyeMainStatus(status);

export const isControlledDayOutcomeStatus = (status) => {
  const normalized = normalizePixelEyeOutcomeStatus(status);
  return DAY_OUTCOME_STATUSES.includes(normalized);
};

const THIRTY_MIN_STATUSES_LOWER = makeLowercaseSet(THIRTY_MIN_STATUSES);
const DNP_STATUSES_LOWER = makeLowercaseSet(DNP_STATUSES);
const TWENTY_FOUR_HR_STATUSES_LOWER = makeLowercaseSet(TWENTY_FOUR_HR_STATUSES);
const FORTY_EIGHT_HR_STATUSES_LOWER = makeLowercaseSet(FORTY_EIGHT_HR_STATUSES);
const NO_REMINDER_STATUSES_LOWER = makeLowercaseSet(NO_REMINDER_STATUSES);
const TERMINATION_STATUSES_LOWER = makeLowercaseSet(TERMINATION_STATUSES);
const NO_ACTION_STATUSES_LOWER = makeLowercaseSet(NO_ACTION_STATUSES);

export const getStatusCategory = (status) => {
  const normalizedStatus = normalizeLookupKey(
    normalizePixelEyeOutcomeStatus(status),
  );

  if (TERMINATION_STATUSES_LOWER.has(normalizedStatus)) return "TERMINATION";
  if (DNP_STATUSES_LOWER.has(normalizedStatus)) return "DNP2";
  if (THIRTY_MIN_STATUSES_LOWER.has(normalizedStatus)) return "THIRTY_MIN";
  if (TWENTY_FOUR_HR_STATUSES_LOWER.has(normalizedStatus))
    return "TWENTY_FOUR_HR";
  if (FORTY_EIGHT_HR_STATUSES_LOWER.has(normalizedStatus))
    return "FORTY_EIGHT_HR";
  if (NO_REMINDER_STATUSES_LOWER.has(normalizedStatus)) return "NO_REMINDER";
  if (NO_ACTION_STATUSES_LOWER.has(normalizedStatus)) return "NO_ACTION";

  return "UNKNOWN";
};

export const isTerminalPixelEyeStatus = (status) => {
  const category = getStatusCategory(status);
  return category === "TERMINATION" || category === "NO_ACTION";
};

const THIRTY_MIN_STATUSES_TO_EXCLUDE = new Set(THIRTY_MIN_STATUSES);

export const getAllowedStatusesForDay = (dayNumber) => {
  if (dayNumber >= 1 && dayNumber <= 4) {
    return DAY_OUTCOME_STATUSES.filter(
      (status) =>
        !DNP_STATUSES.includes(status) ||
        status === DNP_STATUSES[dayNumber - 1],
    );
  }

  if (dayNumber === 5) {
    return [
      ...NO_ACTION_STATUSES,
      ...TERMINATION_STATUSES,
      ...NO_REMINDER_STATUSES,
    ];
  }

  return DAY_OUTCOME_STATUSES.filter(
    (status) => !THIRTY_MIN_STATUSES_TO_EXCLUDE.has(status),
  );
};

export const isAllowedStatusForDay = (status, dayNumber) => {
  const normalized = normalizePixelEyeOutcomeStatus(status);
  return getAllowedStatusesForDay(dayNumber).includes(normalized);
};
