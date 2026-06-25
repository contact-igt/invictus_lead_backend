import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Op } from "sequelize";
import dotenv from "dotenv";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(scriptDir, "../../.env") });

const { default: db } = await import("../database/index.js");
const { normalizePixelEyePhoneNumber } =
  await import("../modules/pixelEye/pixelEyePhoneNumber.js");
const { updatePixelEyeLead, updatePixelEyeFollowUpOutcome } =
  await import("../modules/pixelEye/pixelEye.service.js");

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const TEST_PREFIX = `PX_DIRECT_DAY_POLICY_${RUN_ID}`;
const TEST_CLIENT_KEY = `pixeleye_direct_day_policy_${RUN_ID}`
  .toLowerCase()
  .replace(/[^a-z0-9_]/g, "_");
const TEST_DATE = "2026-06-24";
const TEST_TIME = "10:00:00";
const RUN_SEED = Number(String(Date.now()).slice(-8));

const results = [];
const createdLeadIds = new Set();
let testClient = null;
let cleanupResult = null;

const adminTenant = () => ({
  id: testClient.id,
  isSuperAdmin: false,
  role: "admin",
});

const clientTenant = () => ({
  id: testClient.id,
  isSuperAdmin: false,
  role: "client",
});

const superAdminTenant = () => ({
  id: null,
  isSuperAdmin: true,
  role: "super-admin",
});

const phoneFor = (index) => {
  const suffix = String(RUN_SEED + index)
    .padStart(8, "0")
    .slice(-8);
  return `87${suffix}`;
};

const callIdFor = (label) =>
  `${TEST_PREFIX}_${label}`.replace(/[^A-Z0-9_]/gi, "_");

const rememberLead = (lead) => {
  if (lead?.id) {
    createdLeadIds.add(Number(lead.id));
  }

  return lead;
};

const reloadLead = async (id) =>
  rememberLead(await db.PixelEye.findOne({ where: { id } }));

const createSetupLead = async ({
  index,
  suffix,
  status = "Enquiry",
  day_1 = null,
  day_2 = null,
  day_3 = null,
  day_4 = null,
  day_5 = null,
}) => {
  const normalizedPhone = normalizePixelEyePhoneNumber(phoneFor(index));
  return rememberLead(
    await db.PixelEye.create({
      client_id: testClient.id,
      date: TEST_DATE,
      time: TEST_TIME,
      call_id: callIdFor(suffix),
      customer_name: `${TEST_PREFIX} ${suffix}`,
      phone_number: normalizedPhone,
      normalized_phone_number: normalizedPhone,
      agent_name: "Verification Agent",
      source: "VERIFY_SCRIPT",
      type_of_enquiry: "Verification",
      status,
      day_1,
      day_2,
      day_3,
      day_4,
      day_5,
    }),
  );
};

const expectError = async (fn, messagePattern) => {
  let error = null;

  try {
    await fn();
  } catch (err) {
    error = err;
  }

  assert.ok(error, "Expected operation to throw");
  assert.match(String(error.message || ""), messagePattern);
  return error;
};

const recordCheck = async (name, fn) => {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (err) {
    results.push({ name, passed: false, error: err });
    console.error(`FAIL ${name}: ${err?.message || err}`);
  }
};

const cleanup = async () => {
  if (!testClient?.id) {
    return await db.Client.destroy({ where: { client_key: TEST_CLIENT_KEY } });
  }

  const clientId = testClient.id;
  const deletedCompliance = await db.PixelEyeFollowUpCallCompliance.destroy({
    where: { client_id: clientId },
  });
  const deletedCallLogs = await db.PixelEyeCallLog.destroy({
    where: { client_id: clientId },
  });
  const deletedHistory = await db.PixelEyeFollowUpHistory.destroy({
    where: { client_id: clientId },
  });
  const deletedStates = await db.PixelEyeLeadState.destroy({
    where: { client_id: clientId },
  });
  const deletedLeads = await db.PixelEye.destroy({
    where: { client_id: clientId },
  });
  const deletedClients = await db.Client.destroy({
    where: { id: clientId, client_key: TEST_CLIENT_KEY },
  });
  const fallbackLeads = await db.PixelEye.destroy({
    where: {
      customer_name: { [Op.like]: `${TEST_PREFIX}%` },
    },
  });

  return {
    deletedCompliance,
    deletedCallLogs,
    deletedHistory,
    deletedStates,
    deletedLeads,
    deletedClients,
    fallbackLeads,
  };
};

const setup = async () => {
  await db.sequelize.authenticate();
  testClient = await db.Client.create({
    name: `${TEST_PREFIX} Client`,
    client_key: TEST_CLIENT_KEY,
  });
};

const run = async () => {
  await setup();
  console.log("PixelEye direct day PATCH policy verification started.");
  console.log(`Test client: ${TEST_CLIENT_KEY} (${testClient.id})`);
  console.log(`Test prefix: ${TEST_PREFIX}`);

  await recordCheck("A. admin day_1 DNP 1 is allowed", async () => {
    const lead = await createSetupLead({ index: 1, suffix: "A" });
    await updatePixelEyeLead(lead.id, { day_1: "DNP 1" }, adminTenant());
    const updated = await reloadLead(lead.id);
    assert.equal(updated.day_1, "DNP 1");
  });

  await recordCheck("B. admin day_1 DNP 4 is rejected", async () => {
    const lead = await createSetupLead({ index: 2, suffix: "B" });
    await expectError(
      () => updatePixelEyeLead(lead.id, { day_1: "DNP 4" }, adminTenant()),
      /Selected status is not allowed for Day 1\./,
    );
    const updated = await reloadLead(lead.id);
    assert.equal(updated.day_1, null);
  });

  await recordCheck("C. admin day_2 DNP 2 after day_1 is allowed", async () => {
    const lead = await createSetupLead({
      index: 3,
      suffix: "C",
      day_1: "DNP 1",
    });
    await updatePixelEyeLead(lead.id, { day_2: "DNP 2" }, adminTenant());
    const updated = await reloadLead(lead.id);
    assert.equal(updated.day_2, "DNP 2");
  });

  await recordCheck(
    "D. admin day_2 DNP 1 after day_1 is rejected",
    async () => {
      const lead = await createSetupLead({
        index: 4,
        suffix: "D",
        day_1: "DNP 1",
      });
      await expectError(
        () => updatePixelEyeLead(lead.id, { day_2: "DNP 1" }, adminTenant()),
        /Selected status is not allowed for Day 2\./,
      );
      const updated = await reloadLead(lead.id);
      assert.equal(updated.day_2, null);
    },
  );

  await recordCheck("E. admin day_5 Appointment Fixed is allowed", async () => {
    const lead = await createSetupLead({
      index: 5,
      suffix: "E",
      day_1: "DNP 1",
      day_2: "DNP 2",
      day_3: "DNP 3",
      day_4: "DNP 4",
    });
    await updatePixelEyeLead(
      lead.id,
      { day_5: "Appointment Fixed" },
      adminTenant(),
    );
    const updated = await reloadLead(lead.id);
    assert.equal(updated.day_5, "Appointment Fixed");
  });

  await recordCheck("F. admin day_5 Hot Followup is rejected", async () => {
    const lead = await createSetupLead({
      index: 6,
      suffix: "F",
      day_1: "DNP 1",
      day_2: "DNP 2",
      day_3: "DNP 3",
      day_4: "DNP 4",
    });
    await expectError(
      () =>
        updatePixelEyeLead(lead.id, { day_5: "Hot Followup" }, adminTenant()),
      /Selected status is not allowed for Day 5\./,
    );
    const updated = await reloadLead(lead.id);
    assert.equal(updated.day_5, null);
  });

  await recordCheck(
    "G. admin day_5 Will call & Take Appointment Later is rejected",
    async () => {
      const lead = await createSetupLead({
        index: 7,
        suffix: "G",
        day_1: "DNP 1",
        day_2: "DNP 2",
        day_3: "DNP 3",
        day_4: "DNP 4",
      });
      await expectError(
        () =>
          updatePixelEyeLead(
            lead.id,
            { day_5: "Will call & Take Appointment Later" },
            adminTenant(),
          ),
        /Selected status is not allowed for Day 5\./,
      );
      const updated = await reloadLead(lead.id);
      assert.equal(updated.day_5, null);
    },
  );

  await recordCheck("H. super-admin direct PATCH follows policy", async () => {
    const lead = await createSetupLead({ index: 8, suffix: "H" });
    await expectError(
      () => updatePixelEyeLead(lead.id, { day_1: "DNP 4" }, superAdminTenant()),
      /Selected status is not allowed for Day 1\./,
    );
    const updated = await reloadLead(lead.id);
    assert.equal(updated.day_1, null);
  });

  await recordCheck("I. client direct day PATCH remains blocked", async () => {
    const lead = await createSetupLead({ index: 9, suffix: "I" });
    await expectError(
      () => updatePixelEyeLead(lead.id, { day_1: "DNP 1" }, clientTenant()),
      /Use Update Outcome to update day status\./,
    );
    const updated = await reloadLead(lead.id);
    assert.equal(updated.day_1, null);
  });

  await recordCheck("J. structured outcome endpoint still works", async () => {
    const lead = await createSetupLead({ index: 10, suffix: "J" });
    const outcome = await updatePixelEyeFollowUpOutcome(
      lead.id,
      "DNP 1",
      clientTenant(),
    );
    const updated = await reloadLead(lead.id);
    assert.equal(outcome.updated_day, "day_1");
    assert.equal(updated.day_1, "DNP 1");
  });

  await recordCheck(
    "K. multi-day direct PATCH validates projected state",
    async () => {
      const lead = await createSetupLead({ index: 11, suffix: "K" });
      await updatePixelEyeLead(
        lead.id,
        { day_1: "DNP 1", day_2: "DNP 2" },
        adminTenant(),
      );
      const updated = await reloadLead(lead.id);
      assert.equal(updated.day_1, "DNP 1");
      assert.equal(updated.day_2, "DNP 2");
    },
  );

  await recordCheck(
    "L. invalid multi-day direct PATCH fails entirely",
    async () => {
      const lead = await createSetupLead({ index: 12, suffix: "L" });
      await expectError(
        () =>
          updatePixelEyeLead(
            lead.id,
            { day_1: "DNP 4", day_2: "DNP 2" },
            adminTenant(),
          ),
        /Selected status is not allowed for Day 1\./,
      );
      const updated = await reloadLead(lead.id);
      assert.equal(updated.day_1, null);
      assert.equal(updated.day_2, null);
    },
  );

  await recordCheck(
    "M. terminal prior day blocks later direct PATCH",
    async () => {
      const lead = await createSetupLead({
        index: 13,
        suffix: "M",
        day_1: "Closed",
      });
      await expectError(
        () => updatePixelEyeLead(lead.id, { day_2: "DNP 2" }, adminTenant()),
        /previous day is already closed\/terminal/,
      );
      const updated = await reloadLead(lead.id);
      assert.equal(updated.day_2, null);
    },
  );

  await recordCheck("N. blank day clearing remains allowed", async () => {
    const lead = await createSetupLead({
      index: 14,
      suffix: "N",
      day_1: "DNP 1",
    });
    await updatePixelEyeLead(lead.id, { day_1: null }, adminTenant());
    const updated = await reloadLead(lead.id);
    assert.equal(updated.day_1, null);
  });
};

try {
  await run();
} finally {
  cleanupResult = await cleanup();
  await db.sequelize.close();
}

const failed = results.filter((result) => !result.passed);
console.log("\nPixelEye direct day PATCH policy verification summary");
console.log(`Total checks: ${results.length}`);
console.log(`Passed checks: ${results.length - failed.length}`);
console.log(`Failed checks: ${failed.length}`);
console.log(
  `Created lead IDs: ${
    Array.from(createdLeadIds)
      .sort((a, b) => a - b)
      .join(", ") || "none"
  }`,
);
console.log(`Cleanup result: ${JSON.stringify(cleanupResult)}`);

if (failed.length > 0) {
  process.exitCode = 1;
}
