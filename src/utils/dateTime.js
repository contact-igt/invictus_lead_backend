import {
  APP_TIME_ZONE,
  DATABASE_TIME_ZONE_OFFSET,
  DEFAULT_FOLLOW_UP_TIME,
} from "../config/timezone.config.js";

const pad = (value) => String(value).padStart(2, "0");

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const NAIVE_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/;

export const getDatePartsInAppTimeZone = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
};

export const getAppDateKey = (date = new Date()) => {
  const { year, month, day } = getDatePartsInAppTimeZone(date);
  return `${year}-${month}-${day}`;
};

export const parseAppDateTime = (value, defaultTime = DEFAULT_FOLLOW_UP_TIME) => {
  if (value === undefined || value === null || value === "") return null;

  if (value instanceof Date) {
    const copy = new Date(value.getTime());
    return Number.isNaN(copy.getTime()) ? null : copy;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value < 1e12 ? value * 1000 : value;
    const parsed = new Date(millis);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const text = String(value).trim();
  if (!text) return null;

  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const numeric = Number(text);
    if (!Number.isFinite(numeric)) return null;
    const millis = numeric < 1e12 ? numeric * 1000 : numeric;
    const parsed = new Date(millis);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (DATE_ONLY_PATTERN.test(text)) {
    return buildAppDateTime(text, defaultTime);
  }

  const normalized = NAIVE_DATE_TIME_PATTERN.test(text)
    ? `${text.replace(" ", "T")}${DATABASE_TIME_ZONE_OFFSET}`
    : text;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatAppDateAndTime = (value) => {
  const date = parseAppDateTime(value);
  if (!date) return null;
  const { year, month, day, hour, minute, second } =
    getDatePartsInAppTimeZone(date);
  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}:${second}`,
  };
};

export const normalizeAppDate = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const direct = text.match(/^\d{4}-\d{2}-\d{2}/);
  if (direct) return direct[0];
  const parsed = parseAppDateTime(value);
  return parsed ? getAppDateKey(parsed) : "";
};
export const buildAppDateTime = (
  dateValue,
  timeValue = DEFAULT_FOLLOW_UP_TIME,
) => {
  const date = String(dateValue || "").trim().slice(0, 10);
  const time = String(timeValue || DEFAULT_FOLLOW_UP_TIME).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?$/.test(time)) return null;

  const parsed = new Date(`${date}T${time}${DATABASE_TIME_ZONE_OFFSET}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const getTodayBounds = (date = new Date()) => {
  const dateKey = getAppDateKey(date);
  return {
    now: date,
    start: buildAppDateTime(dateKey, "00:00:00.000"),
    end: buildAppDateTime(dateKey, "23:59:59.999"),
  };
};

export const getMonthBounds = (date = new Date()) => {
  const { year, month } = getDatePartsInAppTimeZone(date);
  const nextMonth = Number(month) === 12 ? 1 : Number(month) + 1;
  const nextYear = Number(month) === 12 ? Number(year) + 1 : Number(year);
  const start = buildAppDateTime(`${year}-${month}-01`, "00:00:00.000");
  const nextStart = buildAppDateTime(
    `${nextYear}-${pad(nextMonth)}-01`,
    "00:00:00.000",
  );

  return {
    start,
    end: new Date(nextStart.getTime() - 1),
  };
};

export const getInclusiveDateRange = (startDate, endDate) => {
  const startKey = startDate ? normalizeAppDate(startDate) : "";
  const endKey = endDate ? normalizeAppDate(endDate) : "";

  return {
    start: startKey ? buildAppDateTime(startKey, "00:00:00.000") : null,
    end: endKey ? buildAppDateTime(endKey, "23:59:59.999") : null,
  };
};

export const formatAppDateTime = (value, options = {}) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    ...options,
  }).format(date);
};

export const formatAppFileDate = (value = new Date()) => getAppDateKey(value);
