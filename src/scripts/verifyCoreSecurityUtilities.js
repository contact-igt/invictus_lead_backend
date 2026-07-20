import assert from "node:assert/strict";
import { Op } from "sequelize";
import {
  authenticateToken,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../middlewares/auth/authMiddlewares.js";
import { escapeCsvValue, sanitizeCsvCell } from "../utils/csv.js";
import { withCreatedAtRange } from "../utils/sequelizeFilters.js";

const testUser = {
  id: 42,
  email: "security-test@example.com",
  username: "security-test",
  role: "admin",
  client_id: 7,
  clientKey: "rio_security_test",
};

const accessToken = generateAccessToken(testUser);
const refreshToken = generateRefreshToken(testUser);

assert.equal(verifyRefreshToken(refreshToken).tokenType, "refresh");
assert.throws(() => verifyRefreshToken(accessToken));

const authenticate = (token) => {
  let statusCode = null;
  let nextCalled = false;
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json() {
      return this;
    },
  };

  authenticateToken(req, res, () => {
    nextCalled = true;
  });

  return { statusCode, nextCalled, user: req.user };
};

const accessResult = authenticate(accessToken);
assert.equal(accessResult.nextCalled, true);
assert.equal(accessResult.user.tokenType, "access");

const refreshResult = authenticate(refreshToken);
assert.equal(refreshResult.nextCalled, false);
assert.equal(refreshResult.statusCode, 401);

for (const dangerousValue of [
  "=1+1",
  "+SUM(A1:A2)",
  "-2+3",
  "@SUM(A1:A2)",
]) {
  assert.equal(sanitizeCsvCell(dangerousValue), `'${dangerousValue}`);
}
assert.equal(sanitizeCsvCell("ordinary text"), "ordinary text");
assert.equal(
  escapeCsvValue("plain text"),
  `"plain text"`,
);

const selectedStart = new Date("2026-07-01T00:00:00.000Z");
const selectedEnd = new Date("2026-07-31T23:59:59.999Z");
const todayStart = new Date("2026-07-20T00:00:00.000Z");
const now = new Date("2026-07-20T12:00:00.000Z");
const selectedRange = {
  created_at: {
    [Op.gte]: selectedStart,
    [Op.lte]: selectedEnd,
  },
};
const combined = withCreatedAtRange(selectedRange, todayStart, now);

assert.equal(combined.created_at[Op.gte], selectedStart);
assert.equal(combined.created_at[Op.lte], selectedEnd);
assert.equal(combined[Op.and][0].created_at[Op.gte], todayStart);
assert.equal(combined[Op.and][0].created_at[Op.lte], now);

console.log("Core auth, CSV, and date-filter security checks passed.");
