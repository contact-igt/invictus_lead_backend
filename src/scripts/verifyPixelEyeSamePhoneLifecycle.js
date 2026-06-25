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
const {
  continuePixelEyeLeadFromManualCreate,
  createPixelEyeLead,
  findPixelEyeLeadByPhone,
} = await import("../modules/pixelEye/pixelEye.service.js");
const { processPixelEyeWebhook } =
  await import("../modules/pixelEye/webhook/pixelEyeWebhook.service.js");

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const TEST_PREFIX = `PX_SAME_PHONE_VERIFY_${RUN_ID}`;
const TEST_CLIENT_KEY = `pixeleye_same_phone_verify_${RUN_ID}`
  .toLowerCase()
  .replace(/[^a-z0-9_]/g, "_");
const TEST_DATE = "2026-06-24";
const TEST_TIME = "10:00:00";
const RUN_SEED = Number(String(Date.now()).slice(-8));

const results = [];
const createdLeadIds = new Set();
let testClient = null;
let cleanupResult = null;

const tenantContext = () => ({
  id: testClient.id,
  isSuperAdmin: false,
  role: "client",
});

const actor = {
  trackFollowUpHistory: true,
  changed_by_user_id: null,
  changed_by_name: "PixelEye Same Phone Verification",
  source: "VERIFY_SCRIPT",
};

const phoneFor = (index) => {
  const suffix = String(RUN_SEED + index)
    .padStart(8, "0")
    .slice(-8);
  return `88${suffix}`;
};

const callIdFor = (label) =>
  `${TEST_PREFIX}_${label}`.replace(/[^A-Z0-9_]/gi, "_");

const rememberLead = (lead) => {
  if (lead?.id) {
    createdLeadIds.add(Number(lead.id));
  }

  return lead;
};

const reloadLead = async (id) => {
  const lead = await db.PixelEye.findOne({ where: { id } });
  return rememberLead(lead);
};

const baseLeadPayload = ({
  phone,
  callId,
  status = "Enquiry",
  suffix = "Lead",
}) => ({
  date: TEST_DATE,
  time: TEST_TIME,
  call_id: callId,
  customer_name: `${TEST_PREFIX} ${suffix}`,
  phone_number: phone,
  agent_name: "Verification Agent",
  source: "VERIFY_SCRIPT",
  type_of_enquiry: "Verification",
  status,
});

const webhookPayload = ({
  phone,
  callId,
  status = "Enquiry",
  suffix = "Webhook",
}) => ({
  _client_key: TEST_CLIENT_KEY,
  call_id: callId,
  customer_name: `${TEST_PREFIX} ${suffix}`,
  phone_number: phone,
  assigned_to: "Verification Agent",
  agent_name: "Verification Agent",
  date: TEST_DATE,
  time: TEST_TIME,
  status,
  type_of_enquiry: "Verification",
  source: "Runo",
});

const leadsForPhone = async (phone) => {
  const normalizedPhone = normalizePixelEyePhoneNumber(phone);
  const leads = await db.PixelEye.findAll({
    where: {
      client_id: testClient.id,
      normalized_phone_number: normalizedPhone,
    },
    order: [
      ["createdAt", "DESC"],
      ["id", "DESC"],
    ],
  });

  for (const lead of leads) {
    rememberLead(lead);
  }

  return leads;
};

const manualCreate = async (payload) => {
  const existingLead = await findPixelEyeLeadByPhone(
    testClient.id,
    payload.phone_number,
  );

  if (existingLead) {
    const outcome = await continuePixelEyeLeadFromManualCreate(
      existingLead,
      payload,
      tenantContext(),
    );

    rememberLead(outcome.lead);
    return {
      action: "continued",
      lead: outcome.lead,
      outcome,
    };
  }

  const lead = rememberLead(
    await createPixelEyeLead(payload, testClient.id, actor),
  );

  return {
    action: "created",
    lead,
  };
};

const createSetupLead = async ({
  phone,
  callId,
  status = "Enquiry",
  suffix = "Setup",
  day_1 = null,
  day_2 = null,
  day_3 = null,
  day_4 = null,
  day_5 = null,
}) => {
  const normalizedPhone = normalizePixelEyePhoneNumber(phone);
  return rememberLead(
    await db.PixelEye.create({
      client_id: testClient.id,
      date: TEST_DATE,
      time: TEST_TIME,
      call_id: callId,
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
  console.log("PixelEye same-phone lifecycle verification started.");
  console.log(`Test client: ${TEST_CLIENT_KEY} (${testClient.id})`);
  console.log(`Test prefix: ${TEST_PREFIX}`);

  await recordCheck(
    "A. phone normalization formats resolve equally",
    async () => {
      const expected = "919876543210";
      assert.equal(normalizePixelEyePhoneNumber("+91 9876543210"), expected);
      assert.equal(normalizePixelEyePhoneNumber("919876543210"), expected);
      assert.equal(normalizePixelEyePhoneNumber("09876543210"), expected);
      assert.equal(normalizePixelEyePhoneNumber("9876543210"), expected);
    },
  );

  await recordCheck(
    "B1. webhook same-phone active lead fills day_1",
    async () => {
      const phone = phoneFor(1);
      const first = await processPixelEyeWebhook(
        webhookPayload({
          phone,
          callId: callIdFor("B1_CREATE"),
          status: "Enquiry",
        }),
      );
      rememberLead(first.lead);

      const second = await processPixelEyeWebhook(
        webhookPayload({
          phone,
          callId: callIdFor("B1_DAY1"),
          status: "DNP 1",
        }),
      );
      const updated = await reloadLead(second.lead.id);
      const leads = await leadsForPhone(phone);

      assert.equal(second.action, "updated");
      assert.equal(Number(updated.id), Number(first.lead.id));
      assert.equal(leads.length, 1);
      assert.equal(updated.day_1, "DNP 1");
      assert.equal(updated.day_2, null);
    },
  );

  await recordCheck(
    "B2. webhook same-phone active lead fills day_2",
    async () => {
      const phone = phoneFor(2);
      const setupLead = await createSetupLead({
        phone,
        callId: callIdFor("B2_ACTIVE_DAY1"),
        status: "Enquiry",
        day_1: "DNP 1",
        suffix: "Webhook Active Day1",
      });

      const result = await processPixelEyeWebhook(
        webhookPayload({
          phone,
          callId: callIdFor("B2_DAY2"),
          status: "Hot Followup",
        }),
      );
      const updated = await reloadLead(setupLead.id);
      const leads = await leadsForPhone(phone);

      assert.equal(result.action, "updated");
      assert.equal(Number(result.lead.id), Number(setupLead.id));
      assert.equal(leads.length, 1);
      assert.equal(updated.day_1, "DNP 1");
      assert.equal(updated.day_2, "Hot Followup");
    },
  );

  await recordCheck(
    "B3. webhook repeated same status progresses next day",
    async () => {
      const phone = phoneFor(3);
      const setupLead = await createSetupLead({
        phone,
        callId: callIdFor("B3_ACTIVE_DAY1"),
        status: "Enquiry",
        day_1: "Hot Followup",
        suffix: "Webhook Repeated Status",
      });

      const result = await processPixelEyeWebhook(
        webhookPayload({
          phone,
          callId: callIdFor("B3_REPEAT"),
          status: "Hot Followup",
        }),
      );
      const updated = await reloadLead(setupLead.id);
      const leads = await leadsForPhone(phone);

      assert.equal(result.action, "updated");
      assert.equal(leads.length, 1);
      assert.equal(updated.day_2, "Hot Followup");
    },
  );

  await recordCheck("C. webhook completed lead creates new cycle", async () => {
    const phone = phoneFor(4);
    const oldLead = await createSetupLead({
      phone,
      callId: callIdFor("C_CLOSED"),
      status: "Closed",
      suffix: "Webhook Closed",
    });

    const result = await processPixelEyeWebhook(
      webhookPayload({
        phone,
        callId: callIdFor("C_NEW"),
        status: "Enquiry",
      }),
    );
    rememberLead(result.lead);
    const reloadedOld = await reloadLead(oldLead.id);
    const leads = await leadsForPhone(phone);

    assert.equal(result.action, "created");
    assert.equal(leads.length, 2);
    assert.notEqual(Number(result.lead.id), Number(oldLead.id));
    assert.equal(reloadedOld.status, "Closed");
    assert.equal(reloadedOld.day_1, null);
  });

  await recordCheck(
    "D. webhook all-days-filled lead creates new cycle",
    async () => {
      const phone = phoneFor(5);
      const oldLead = await createSetupLead({
        phone,
        callId: callIdFor("D_FULL"),
        status: "Enquiry",
        day_1: "DNP 1",
        day_2: "DNP 2",
        day_3: "DNP 3",
        day_4: "DNP 4",
        day_5: "Closed",
        suffix: "Webhook Full Days",
      });

      const result = await processPixelEyeWebhook(
        webhookPayload({
          phone,
          callId: callIdFor("D_NEW"),
          status: "Enquiry",
        }),
      );
      rememberLead(result.lead);
      const reloadedOld = await reloadLead(oldLead.id);
      const leads = await leadsForPhone(phone);

      assert.equal(result.action, "created");
      assert.equal(leads.length, 2);
      assert.notEqual(Number(result.lead.id), Number(oldLead.id));
      assert.equal(reloadedOld.day_5, "Closed");
    },
  );

  await recordCheck(
    "E1. webhook ignores older active when latest is completed",
    async () => {
      const phone = phoneFor(6);
      const olderActive = await createSetupLead({
        phone,
        callId: callIdFor("E1_OLDER_ACTIVE"),
        status: "Enquiry",
        suffix: "Webhook Older Active",
      });
      const latestClosed = await createSetupLead({
        phone,
        callId: callIdFor("E1_LATEST_CLOSED"),
        status: "Closed",
        suffix: "Webhook Latest Closed",
      });

      const result = await processPixelEyeWebhook(
        webhookPayload({
          phone,
          callId: callIdFor("E1_NEW"),
          status: "Enquiry",
        }),
      );
      rememberLead(result.lead);
      const reloadedOlder = await reloadLead(olderActive.id);
      const reloadedClosed = await reloadLead(latestClosed.id);
      const leads = await leadsForPhone(phone);

      assert.equal(result.action, "created");
      assert.equal(leads.length, 3);
      assert.equal(reloadedOlder.day_1, null);
      assert.equal(reloadedClosed.status, "Closed");
    },
  );

  await recordCheck(
    "E2. manual create ignores older active when latest is completed",
    async () => {
      const phone = phoneFor(7);
      const olderActive = await createSetupLead({
        phone,
        callId: callIdFor("E2_OLDER_ACTIVE"),
        status: "Enquiry",
        suffix: "Manual Older Active",
      });
      const latestClosed = await createSetupLead({
        phone,
        callId: callIdFor("E2_LATEST_CLOSED"),
        status: "Closed",
        suffix: "Manual Latest Closed",
      });

      const result = await manualCreate(
        baseLeadPayload({
          phone,
          callId: callIdFor("E2_NEW"),
          status: "Enquiry",
          suffix: "Manual New",
        }),
      );
      const reloadedOlder = await reloadLead(olderActive.id);
      const reloadedClosed = await reloadLead(latestClosed.id);
      const leads = await leadsForPhone(phone);

      assert.equal(result.action, "created");
      assert.equal(leads.length, 3);
      assert.equal(reloadedOlder.day_1, null);
      assert.equal(reloadedClosed.status, "Closed");
    },
  );

  await recordCheck(
    "F. manual create same-phone active lead progresses day fields",
    async () => {
      const phone = phoneFor(8);
      const first = await manualCreate(
        baseLeadPayload({
          phone,
          callId: callIdFor("F_CREATE"),
          status: "Enquiry",
          suffix: "Manual First",
        }),
      );
      const second = await manualCreate(
        baseLeadPayload({
          phone,
          callId: callIdFor("F_DAY1"),
          status: "DNP 1",
          suffix: "Manual Day1",
        }),
      );
      const third = await manualCreate(
        baseLeadPayload({
          phone,
          callId: callIdFor("F_DAY2"),
          status: "Hot Followup",
          suffix: "Manual Day2",
        }),
      );
      const updated = await reloadLead(first.lead.id);
      const leads = await leadsForPhone(phone);

      assert.equal(first.action, "created");
      assert.equal(second.action, "continued");
      assert.equal(third.action, "continued");
      assert.equal(leads.length, 1);
      assert.equal(updated.day_1, "DNP 1");
      assert.equal(updated.day_2, "Hot Followup");
    },
  );

  await recordCheck(
    "F2. manual create repeated same status progresses next day",
    async () => {
      const phone = phoneFor(9);
      const first = await manualCreate(
        baseLeadPayload({
          phone,
          callId: callIdFor("F2_CREATE"),
          status: "Enquiry",
          suffix: "Manual Repeat First",
        }),
      );
      await manualCreate(
        baseLeadPayload({
          phone,
          callId: callIdFor("F2_DAY1"),
          status: "Hot Followup",
          suffix: "Manual Repeat Day1",
        }),
      );
      await manualCreate(
        baseLeadPayload({
          phone,
          callId: callIdFor("F2_DAY2"),
          status: "Hot Followup",
          suffix: "Manual Repeat Day2",
        }),
      );
      const updated = await reloadLead(first.lead.id);
      const leads = await leadsForPhone(phone);

      assert.equal(leads.length, 1);
      assert.equal(updated.day_1, "Hot Followup");
      assert.equal(updated.day_2, "Hot Followup");
    },
  );

  await recordCheck(
    "G. manual create completed lead creates new cycle",
    async () => {
      const phone = phoneFor(10);
      const oldLead = await createSetupLead({
        phone,
        callId: callIdFor("G_APPOINTMENT_FIXED"),
        status: "Appointment Fixed",
        suffix: "Manual Completed",
      });

      const result = await manualCreate(
        baseLeadPayload({
          phone,
          callId: callIdFor("G_NEW"),
          status: "Enquiry",
          suffix: "Manual New Cycle",
        }),
      );
      const reloadedOld = await reloadLead(oldLead.id);
      const leads = await leadsForPhone(phone);

      assert.equal(result.action, "created");
      assert.equal(leads.length, 2);
      assert.notEqual(Number(result.lead.id), Number(oldLead.id));
      assert.equal(reloadedOld.status, "Appointment Fixed");
    },
  );

  await recordCheck(
    "H1. invalid DNP 4 on Day 1 returns error and no update",
    async () => {
      const phone = phoneFor(11);
      const first = await manualCreate(
        baseLeadPayload({
          phone,
          callId: callIdFor("H1_CREATE"),
          status: "Enquiry",
          suffix: "Invalid Day1",
        }),
      );

      const error = await expectError(
        () =>
          manualCreate(
            baseLeadPayload({
              phone,
              callId: callIdFor("H1_INVALID"),
              status: "DNP 4",
              suffix: "Invalid Day1 Again",
            }),
          ),
        /Selected status is not allowed for Day 1/i,
      );
      const updated = await reloadLead(first.lead.id);
      const leads = await leadsForPhone(phone);

      assert.ok(error.message);
      assert.equal(leads.length, 1);
      assert.equal(updated.day_1, null);
      assert.equal(updated.day_2, null);
    },
  );

  await recordCheck(
    "H2. invalid DNP 1 on Day 2 returns error and no update",
    async () => {
      const phone = phoneFor(12);
      const first = await manualCreate(
        baseLeadPayload({
          phone,
          callId: callIdFor("H2_CREATE"),
          status: "Enquiry",
          suffix: "Invalid Day2",
        }),
      );
      await manualCreate(
        baseLeadPayload({
          phone,
          callId: callIdFor("H2_DAY1"),
          status: "DNP 1",
          suffix: "Invalid Day2 Day1",
        }),
      );

      await expectError(
        () =>
          manualCreate(
            baseLeadPayload({
              phone,
              callId: callIdFor("H2_INVALID"),
              status: "DNP 1",
              suffix: "Invalid Day2 Again",
            }),
          ),
        /Selected status is not allowed for Day 2/i,
      );
      const updated = await reloadLead(first.lead.id);
      const leads = await leadsForPhone(phone);

      assert.equal(leads.length, 1);
      assert.equal(updated.day_1, "DNP 1");
      assert.equal(updated.day_2, null);
    },
  );

  await recordCheck(
    "H3. webhook invalid DNP 4 on Day 1 returns error and no update",
    async () => {
      const phone = phoneFor(13);
      const first = await processPixelEyeWebhook(
        webhookPayload({
          phone,
          callId: callIdFor("H3_CREATE"),
          status: "Enquiry",
        }),
      );
      rememberLead(first.lead);

      await expectError(
        () =>
          processPixelEyeWebhook(
            webhookPayload({
              phone,
              callId: callIdFor("H3_INVALID"),
              status: "DNP 4",
            }),
          ),
        /Selected status is not allowed for Day 1/i,
      );
      const updated = await reloadLead(first.lead.id);
      const leads = await leadsForPhone(phone);

      assert.equal(leads.length, 1);
      assert.equal(updated.day_1, null);
    },
  );

  await recordCheck(
    "I. duplicate webhook same call_id does not duplicate outcome",
    async () => {
      const phone = phoneFor(14);
      const setupLead = await createSetupLead({
        phone,
        callId: callIdFor("I_ACTIVE"),
        status: "Enquiry",
        suffix: "Duplicate Webhook Active",
      });
      const duplicateCallId = callIdFor("I_DUPLICATE_CALL");
      const payload = webhookPayload({
        phone,
        callId: duplicateCallId,
        status: "DNP 1",
      });

      const first = await processPixelEyeWebhook(payload);
      const second = await processPixelEyeWebhook(payload);
      const updated = await reloadLead(setupLead.id);
      const callLog = await db.PixelEyeCallLog.findOne({
        where: {
          client_id: testClient.id,
          call_id: duplicateCallId,
        },
      });
      const leads = await leadsForPhone(phone);

      assert.equal(first.action, "updated");
      assert.equal(second.action, "updated");
      assert.equal(leads.length, 1);
      assert.equal(updated.day_1, "DNP 1");
      assert.equal(updated.day_2, null);
      assert.ok(callLog?.outcome_applied_at);
      assert.equal(callLog.outcome_day_number, 1);
      assert.equal(callLog.outcome_status, "DNP 1");
    },
  );

  await recordCheck(
    "J. same phone under different client_id does not match",
    async () => {
      const phone = phoneFor(15);
      const otherClient = await db.Client.create({
        name: `${TEST_PREFIX} Other Client`,
        client_key: `${TEST_CLIENT_KEY}_other`,
      });
      let otherLead = null;

      try {
        otherLead = await createPixelEyeLead(
          baseLeadPayload({
            phone,
            callId: callIdFor("J_OTHER_CLIENT"),
            status: "Enquiry",
            suffix: "Other Client Lead",
          }),
          otherClient.id,
          actor,
        );

        const result = await processPixelEyeWebhook(
          webhookPayload({
            phone,
            callId: callIdFor("J_TEST_CLIENT"),
            status: "Enquiry",
          }),
        );
        rememberLead(result.lead);
        const testClientLeads = await leadsForPhone(phone);
        const reloadedOtherLead = await db.PixelEye.findOne({
          where: { id: otherLead.id },
        });

        assert.equal(result.action, "created");
        assert.equal(testClientLeads.length, 1);
        assert.notEqual(Number(result.lead.id), Number(otherLead.id));
        assert.equal(reloadedOtherLead.client_id, otherClient.id);
        assert.equal(reloadedOtherLead.day_1, null);
      } finally {
        if (otherLead?.id) {
          await db.PixelEyeFollowUpCallCompliance.destroy({
            where: { client_id: otherClient.id },
          });
          await db.PixelEyeCallLog.destroy({
            where: { client_id: otherClient.id },
          });
          await db.PixelEyeFollowUpHistory.destroy({
            where: { client_id: otherClient.id },
          });
          await db.PixelEyeLeadState.destroy({
            where: { client_id: otherClient.id },
          });
          await db.PixelEye.destroy({ where: { client_id: otherClient.id } });
        }
        await db.Client.destroy({ where: { id: otherClient.id } });
      }
    },
  );
};

try {
  await run();
} finally {
  cleanupResult = await cleanup().catch((err) => ({
    cleanupError: err.message,
  }));
  await db.sequelize.close().catch(() => {});
}

const totalChecks = results.length;
const passedChecks = results.filter((result) => result.passed).length;
const failedChecks = totalChecks - passedChecks;

console.log("\nPixelEye same-phone lifecycle verification summary");
console.log(`Total checks: ${totalChecks}`);
console.log(`Passed checks: ${passedChecks}`);
console.log(`Failed checks: ${failedChecks}`);
console.log(
  `Created lead IDs: ${Array.from(createdLeadIds).join(", ") || "none"}`,
);
console.log(`Cleanup result: ${JSON.stringify(cleanupResult)}`);

if (failedChecks > 0) {
  process.exitCode = 1;
}
