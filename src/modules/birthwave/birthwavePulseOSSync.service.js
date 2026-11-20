import { Op } from "sequelize";
import db from "../../database/index.js";
import { birthwavePulseOSColumns } from "../../database/tables/BirthwaveWebsiteLeadTable/index.js";
import { tableName } from "../../database/tables/tableName.js";

const MAX_ATTEMPTS = 6;
const POLL_MS = 30_000;
const LEASE_MS = 60_000;

export async function ensureBirthwavePulseOSColumns() {
  const table = tableName.BIRTHWAVE_WEBSITE_LEADS;
  const query = db.sequelize.getQueryInterface();
  const existing = await query.describeTable(table);
  for (const [name, definition] of Object.entries(birthwavePulseOSColumns(db.Sequelize))) {
    if (!Object.hasOwn(existing, name)) {
      try {
        await query.addColumn(table, name, definition);
      } catch (error) {
        if (error.original?.code !== "ER_DUP_FIELDNAME") throw error;
      }
    }
  }
  const index = "idx_bw_web_leads_pulseos_sync";
  if (!(await query.showIndex(table)).some(({ name }) => name === index)) {
    try {
      await query.addIndex(table, ["pulseos_sync_status", "pulseos_sync_next_attempt_at"], { name: index });
    } catch (error) {
      if (error.original?.code !== "ER_DUP_KEYNAME") throw error;
    }
  }
}

const clipped = (value, limit) => value?.trim().slice(0, limit) || null;

function submission(row) {
  const email = row.email?.trim();
  return {
    submissionId: `birthwave-website-${row.id}`,
    formId: "website-contact-v1",
    name: clipped(row.name, 120),
    phone: row.phone,
    email: email || null,
    service: clipped(row.service, 120),
    message: clipped(row.message, 1000),
    pageUrl: clipped(row.landing_page, 500),
    utm: {
      source: row.utm_source,
      medium: row.utm_medium,
      campaign: row.utm_campaign,
      content: row.utm_content,
      term: row.utm_term,
    },
    clickIds: { gclid: clipped(row.gclid, 200), fbclid: clipped(row.fbclid, 200) },
  };
}

async function deliver(row, url, token) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-PulseOS-Intake-Token": token },
      body: JSON.stringify(submission(row)),
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
    if (response.ok && (await response.json().catch(() => null))?.ok === true) return null;
    return {
      error: response.ok ? "unexpected_response" : `http_${response.status}`,
      retry: response.ok || response.status === 429 || response.status >= 500,
    };
  } catch {
    return { error: "network_error", retry: true };
  }
}

async function syncBatch(url, token) {
  const leads = db.BirthwaveWebsiteLead;
  const due = {
    pulseos_sync_status: { [Op.in]: ["pending", "syncing"] },
    pulseos_sync_next_attempt_at: { [Op.lte]: new Date() },
  };
  const rows = await leads.findAll({
    where: due,
    order: [["pulseos_sync_next_attempt_at", "ASC"], ["id", "ASC"]],
    limit: 10,
  });
  for (const row of rows) {
    const attempts = row.pulseos_sync_attempts;
    const claimed = { id: row.id, pulseos_sync_attempts: attempts, ...due };
    if (attempts >= MAX_ATTEMPTS) {
      await leads.update({
        pulseos_sync_status: "failed",
        pulseos_sync_next_attempt_at: null,
        pulseos_sync_last_error: "attempts_exhausted",
      }, { where: claimed });
      continue;
    }
    const nextAttempt = attempts + 1;
    const [count] = await leads.update({
      pulseos_sync_status: "syncing",
      pulseos_sync_attempts: nextAttempt,
      pulseos_sync_next_attempt_at: new Date(Date.now() + LEASE_MS),
    }, { where: claimed });
    if (!count) continue;

    const failure = await deliver(row, url, token);
    const retry = failure?.retry && nextAttempt < MAX_ATTEMPTS;
    await leads.update({
      pulseos_sync_status: failure ? (retry ? "pending" : "failed") : "synced",
      pulseos_sync_next_attempt_at: retry ? new Date(Date.now() + POLL_MS * 2 ** nextAttempt) : null,
      pulseos_sync_last_error: failure?.error ?? null,
      pulseos_synced_at: failure ? null : new Date(),
    }, { where: { id: row.id, pulseos_sync_status: "syncing", pulseos_sync_attempts: nextAttempt } });
  }
}

export function startBirthwavePulseOSSyncScheduler() {
  const rawUrl = process.env.PULSEOS_BIRTHWAVE_INTAKE_URL?.trim();
  const token = process.env.PULSEOS_BIRTHWAVE_INTAKE_TOKEN?.trim();
  if (!rawUrl || !token) return;
  const url = URL.canParse(rawUrl) ? new URL(rawUrl) : null;
  if (url?.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      !/^\/forms\/website\/[a-z0-9-]+$/i.test(url.pathname)) {
    console.error("[Birthwave PulseOS Sync] Invalid intake URL.");
    return;
  }
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await syncBatch(url, token);
    } catch {
      console.error("[Birthwave PulseOS Sync] Could not process the delivery queue.");
    } finally {
      running = false;
    }
  };
  void tick();
  setInterval(tick, POLL_MS).unref();
}
