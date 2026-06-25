import { Op } from "sequelize";
import db from "../../database/index.js";
import { listPixelEyeLeads } from "./pixelEye.service.js";
import { isTerminalLeadStatus } from "./pixelEyeNotification.service.js";

const EMPTY_SUMMARY = {
  active_manual: 0,
  missed: 0,
  completed_done: 0,
  called_outcome_missing: 0,
  needs_review: 0,
  rescheduled: 0,
  cancelled: 0,
  reminders_sent: 0,
  outcomes_saved: 0,
};

const normalizeText = (value) => String(value || "").trim();

const normalizeLower = (value) => normalizeText(value).toLowerCase();

const normalizeUpper = (value) => normalizeText(value).toUpperCase();

const normalizeDateForFilter = (value) => {
  const text = normalizeText(value);
  if (!text) return "";

  const directDate = text.match(/^\d{4}-\d{2}-\d{2}/);
  if (directDate) {
    return directDate[0];
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isLeadInsideFollowUpDateRange = (lead, filters = {}) => {
  const from = normalizeDateForFilter(filters.from);
  const to = normalizeDateForFilter(filters.to);

  if (!from && !to) {
    return true;
  }

  const followUpDate = normalizeDateForFilter(lead?.follow_up_date);
  if (!followUpDate) {
    return false;
  }

  if (from && followUpDate < from) {
    return false;
  }

  if (to && followUpDate > to) {
    return false;
  }

  return true;
};
const parseTimestamp = (value) => {
  const text = normalizeText(value);
  if (!text) return 0;

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const normalizeMetadata = (metadata) => {
  if (metadata === null || metadata === undefined) return null;

  if (typeof metadata === "string") {
    const text = metadata.trim();
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  if (typeof metadata === "object") {
    return metadata;
  }

  return null;
};

const getHistoryMetadata = (row) => normalizeMetadata(row?.metadata) || null;

const isOutcomeAppliedRow = (row) =>
  normalizeText(getHistoryMetadata(row)?.action) === "OUTCOME_APPLIED";

const isRescheduledRow = (row) =>
  normalizeUpper(row?.change_type) === "RESCHEDULED";

const getHistoryTimestamp = (row) =>
  parseTimestamp(row?.created_at || row?.createdAt || null);

const getComplianceTimestamp = (row) =>
  Math.max(
    parseTimestamp(row?.matched_call_started_at || null),
    parseTimestamp(row?.updated_at || row?.updatedAt || null),
    parseTimestamp(row?.created_at || row?.createdAt || null),
    parseTimestamp(row?.allowed_until || null),
    parseTimestamp(row?.scheduled_follow_up_at || null),
  );

const buildLeadKey = (lead) => {
  const leadId = Number(lead?.id || 0);
  if (Number.isFinite(leadId) && leadId > 0) {
    return `lead:${leadId}`;
  }

  const callId = normalizeText(lead?.call_id);
  if (callId) {
    return `call:${callId}`;
  }

  return null;
};

const resolveRowLeadKey = (row, leadKeyById, leadKeyByCallId) => {
  const leadId = Number(row?.lead_id || 0);
  if (Number.isFinite(leadId) && leadId > 0 && leadKeyById.has(leadId)) {
    return leadKeyById.get(leadId);
  }

  const callId = normalizeText(row?.call_id);
  if (callId && leadKeyByCallId.has(callId)) {
    return leadKeyByCallId.get(callId);
  }

  return null;
};

const sortRowsByNewest = (rows, getTimestamp) =>
  (Array.isArray(rows) ? rows : [])
    .slice()
    .sort((a, b) => getTimestamp(b) - getTimestamp(a));

const hasExplicitCancelHistory = (historyRows = []) =>
  historyRows.some((row) => {
    const metadata = getHistoryMetadata(row);
    const action = normalizeLower(metadata?.action);
    const reason = normalizeLower(row?.reason);
    return action.includes("cancel") || reason.includes("cancel");
  });

const hasLegacyHistoryWithoutMetadata = (historyRows = []) =>
  historyRows.some(
    (row) => !getHistoryMetadata(row) && normalizeText(row?.change_type),
  );

const buildScopedLifecycleWhere = (clientId, leadIds, callIds) => {
  const filters = [];

  if (Array.isArray(leadIds) && leadIds.length > 0) {
    filters.push({ lead_id: { [Op.in]: leadIds } });
  }

  if (Array.isArray(callIds) && callIds.length > 0) {
    filters.push({ call_id: { [Op.in]: callIds } });
  }

  if (!clientId || filters.length === 0) {
    return null;
  }

  return {
    client_id: clientId,
    [Op.or]: filters,
  };
};

const buildInitialLeadContext = (lead) => ({
  lead,
  key: buildLeadKey(lead),
  historyRows: [],
  complianceRows: [],
});

export const getFollowUpLifecycleSummary = async ({ tenant, clientId, filters = {} }) => {
  if (!clientId) {
    return { ...EMPTY_SUMMARY };
  }

  const allLeads = await listPixelEyeLeads(tenant, clientId);
  const leads = Array.isArray(allLeads)
    ? allLeads.filter((lead) => isLeadInsideFollowUpDateRange(lead, filters))
    : [];
  if (leads.length === 0) {
    return { ...EMPTY_SUMMARY };
  }

  const leadContexts = [];
  const leadKeyById = new Map();
  const leadKeyByCallId = new Map();
  const leadContextByKey = new Map();
  const leadIds = [];
  const callIds = [];

  for (const lead of leads) {
    const context = buildInitialLeadContext(lead);
    if (!context.key) continue;

    leadContexts.push(context);
    leadContextByKey.set(context.key, context);

    const leadId = Number(lead?.id || 0);
    if (Number.isFinite(leadId) && leadId > 0) {
      leadKeyById.set(leadId, context.key);
      leadIds.push(leadId);
    }

    const callId = normalizeText(lead?.call_id);
    if (callId) {
      leadKeyByCallId.set(callId, context.key);
      callIds.push(callId);
    }
  }

  const lifecycleWhere = buildScopedLifecycleWhere(
    clientId,
    Array.from(new Set(leadIds)),
    Array.from(new Set(callIds)),
  );

  if (!lifecycleWhere) {
    return { ...EMPTY_SUMMARY };
  }

  const [historyRowsRaw, complianceRowsRaw] = await Promise.all([
    db.PixelEyeFollowUpHistory.findAll({
      where: lifecycleWhere,
      order: [
        ["created_at", "DESC"],
        ["id", "DESC"],
      ],
    }),
    db.PixelEyeFollowUpCallCompliance.findAll({
      where: lifecycleWhere,
      order: [
        ["updated_at", "DESC"],
        ["created_at", "DESC"],
        ["id", "DESC"],
      ],
    }),
  ]);

  for (const row of historyRowsRaw) {
    const key = resolveRowLeadKey(row, leadKeyById, leadKeyByCallId);
    if (!key || !leadContextByKey.has(key)) continue;
    leadContextByKey.get(key).historyRows.push(row);
  }

  for (const row of complianceRowsRaw) {
    const key = resolveRowLeadKey(row, leadKeyById, leadKeyByCallId);
    if (!key || !leadContextByKey.has(key)) continue;
    leadContextByKey.get(key).complianceRows.push(row);
  }

  const summary = { ...EMPTY_SUMMARY };

  for (const context of leadContexts) {
    const lead = context.lead;
    const historyRows = sortRowsByNewest(
      context.historyRows,
      getHistoryTimestamp,
    );
    const complianceRows = sortRowsByNewest(
      context.complianceRows,
      getComplianceTimestamp,
    );

    const latestHistoryRow = historyRows[0] || null;
    const latestHistoryAt = getHistoryTimestamp(latestHistoryRow);
    const latestOutcomeRow =
      historyRows.find((row) => isOutcomeAppliedRow(row)) || null;
    const latestOutcomeAt = getHistoryTimestamp(latestOutcomeRow);
    const latestComplianceRow = complianceRows[0] || null;
    const latestComplianceStatus = normalizeUpper(
      latestComplianceRow?.compliance_status,
    );
    const latestComplianceAt = getComplianceTimestamp(latestComplianceRow);

    const activeFollowUpDate = normalizeText(lead?.follow_up_date);
    const followUpState = normalizeLower(lead?.followup_state);
    const completionSource = normalizeLower(lead?.followup_completion_source);
    const isReminderSentOnly =
      followUpState === "completed" && completionSource === "notification_sent";

    // Notification sent is reminder-delivery visibility only. It must never be treated as follow-up done.
    if (isReminderSentOnly) {
      summary.reminders_sent += 1;
    }

    if (historyRows.some((row) => isRescheduledRow(row))) {
      summary.rescheduled += 1;
    }

    // completed_done is a distinct lead count. outcomes_saved is a raw OUTCOME_APPLIED event count.
    summary.outcomes_saved += historyRows.filter((row) =>
      isOutcomeAppliedRow(row),
    ).length;

    const hasLaterNonOutcomeHistory = historyRows.some(
      (row) =>
        !isOutcomeAppliedRow(row) && getHistoryTimestamp(row) > latestOutcomeAt,
    );

    const doneCandidate =
      Boolean(latestOutcomeRow) &&
      !hasLaterNonOutcomeHistory &&
      (!latestComplianceAt || latestOutcomeAt >= latestComplianceAt);

    const missedCandidate =
      latestComplianceStatus === "MISSED" &&
      (!latestOutcomeAt || latestComplianceAt > latestOutcomeAt);

    const cancelledCandidate =
      !doneCandidate &&
      !missedCandidate &&
      (latestComplianceStatus === "CANCELLED" ||
        followUpState === "cancelled" ||
        hasExplicitCancelHistory(historyRows));

    const calledOutcomeMissingCandidate =
      !doneCandidate &&
      !missedCandidate &&
      !cancelledCandidate &&
      latestComplianceStatus === "CALLED" &&
      (!latestOutcomeAt || latestOutcomeAt < latestComplianceAt);

    const activeManualCandidate =
      Boolean(activeFollowUpDate) &&
      !isTerminalLeadStatus(lead?.status) &&
      !doneCandidate &&
      !missedCandidate &&
      !cancelledCandidate &&
      !calledOutcomeMissingCandidate;

    const hasLifecycleEvidence =
      Boolean(activeFollowUpDate) ||
      Boolean(followUpState) ||
      Boolean(completionSource) ||
      Boolean(lead?.reminder_notification_sent) ||
      Boolean(lead?.reminder_permanently_closed) ||
      historyRows.length > 0 ||
      complianceRows.length > 0;

    const hasManualHandledWithoutOutcome =
      completionSource === "manual_handled" && !latestOutcomeRow;

    const conflictingLifecycleEvidence =
      Boolean(activeFollowUpDate) &&
      (followUpState === "cancelled" ||
        completionSource === "manual_handled" ||
        Boolean(lead?.reminder_permanently_closed));

    const needsReviewCandidate =
      !doneCandidate &&
      !missedCandidate &&
      !cancelledCandidate &&
      !calledOutcomeMissingCandidate &&
      !activeManualCandidate &&
      hasLifecycleEvidence &&
      (hasManualHandledWithoutOutcome ||
        conflictingLifecycleEvidence ||
        latestComplianceStatus === "IGNORED" ||
        (Boolean(activeFollowUpDate) &&
          !latestComplianceRow &&
          !latestHistoryRow) ||
        (isTerminalLeadStatus(lead?.status) && !latestOutcomeRow) ||
        hasLegacyHistoryWithoutMetadata(historyRows) ||
        historyRows.length > 0 ||
        complianceRows.length > 0);

    if (doneCandidate) {
      summary.completed_done += 1;
      continue;
    }

    if (missedCandidate) {
      summary.missed += 1;
      continue;
    }

    if (cancelledCandidate) {
      summary.cancelled += 1;
      continue;
    }

    if (calledOutcomeMissingCandidate) {
      summary.called_outcome_missing += 1;
      continue;
    }

    if (activeManualCandidate) {
      summary.active_manual += 1;
      continue;
    }

    if (needsReviewCandidate) {
      summary.needs_review += 1;
    }
  }

  return summary;
};

export default getFollowUpLifecycleSummary;
