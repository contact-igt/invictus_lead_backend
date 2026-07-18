import "./env.config.js";

const DEFAULT_APP_TIME_ZONE = "Asia/Kolkata";
const DEFAULT_DATABASE_TIME_ZONE_OFFSET = "+05:30";

const resolveIanaTimeZone = (value) => {
  const timeZone = String(value || DEFAULT_APP_TIME_ZONE).trim();

  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    throw new Error(`Invalid APP_TIME_ZONE: ${timeZone}`);
  }
};

const resolveDatabaseOffset = (value) => {
  const offset = String(value || DEFAULT_DATABASE_TIME_ZONE_OFFSET).trim();
  if (!/^[+-](?:0\d|1\d|2[0-3]):[0-5]\d$/.test(offset)) {
    throw new Error(`Invalid DATABASE_TIME_ZONE_OFFSET: ${offset}`);
  }
  return offset;
};

export const APP_TIME_ZONE = resolveIanaTimeZone(process.env.APP_TIME_ZONE);
export const DATABASE_TIME_ZONE_OFFSET = resolveDatabaseOffset(
  process.env.DATABASE_TIME_ZONE_OFFSET,
);
export const DEFAULT_FOLLOW_UP_TIME = "09:00:00";

const TimeZoneConfig = Object.freeze({
  appTimeZone: APP_TIME_ZONE,
  databaseOffset: DATABASE_TIME_ZONE_OFFSET,
  defaultFollowUpTime: DEFAULT_FOLLOW_UP_TIME,
});

export default TimeZoneConfig;
