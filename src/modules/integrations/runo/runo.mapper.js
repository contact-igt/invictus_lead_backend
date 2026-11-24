import { BIRTHWAVE_WEBSITE_SOURCE_KEYS } from "../../../database/tables/BirthwaveWebsiteLeadTable/index.js";
import { extractClientModuleKey } from "../../../utils/clientKey.js";

// Canonical values written by createWebsiteLead(): birthwave_leads.source is
// always "website"; birthwave_leads.source_provider carries the source_key
// ("birthwave_website" = main site, every other key = a landing page).
export const RUNO_ELIGIBLE_LEAD_SOURCE = "website";
export const BIRTHWAVE_MAIN_WEBSITE_SOURCE_KEY = "birthwave_website";

/**
 * Explicit allow-list: only Birthwave website + landing-page intake is
 * forwarded. Repli/Instagram, admin-created, imported and other clients'
 * leads never qualify.
 */
export const shouldSendBirthwaveLeadToRuno = ({ clientKey, source, sourceProvider } = {}) =>
  extractClientModuleKey(clientKey) === "birthwave" &&
  source === RUNO_ELIGIBLE_LEAD_SOURCE &&
  BIRTHWAVE_WEBSITE_SOURCE_KEYS.includes(sourceProvider);

// Human page name per source_key, used for the Runo subject.
const PAGE_LABELS = {
  birthwave_website: 'Website',
  birthwave_normalbirth: 'Normal Birth',
  birthwave_naturalbirth: 'Natural Birth',
  birthwave_pregnancycare: 'Pregnancy Care',
  birthwave_prenatal_yoga: 'Prenatal Yoga',
  birthwave_vbac: 'VBAC',
  birthwave_vaginismus: 'Vaginismus',
  birthwave_workshop: 'Childbirth Workshop',
};
export const runoPageLabel = (sourceKey) => PAGE_LABELS[sourceKey] || 'Landing Page';

export const runoSourceLabel = (sourceKey) =>
  sourceKey === BIRTHWAVE_MAIN_WEBSITE_SOURCE_KEY ? "Website" : "Landing Page";

// DB normalization (+91XXXXXXXXXX) is untouched; only the Runo presentation
// is adapted here. "national" (default) matches Runo's sample (9898989898).
export const formatPhoneForRuno = (phone, format = "national") => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  if (format === "e164") return `+${digits}`;
  if (format === "digits") return digits;
  return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
};

const clean = (value, max = 2000) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;

const WEBSITE_PAGE_LABELS = {
  "vbac": "VBAC",
  "faq": "FAQ",
};

const websitePageLabel = (page) => {
  const input = clean(page, 255);
  if (!input || !/^(\/[^/]|\/$|https?:\/\/)/i.test(input)) return undefined;

  const pathname = URL.parse(input, "https://birthwave.invalid")?.pathname;
  if (!pathname) return undefined;
  const segments = pathname.split("/").filter(Boolean);
  if (!segments.length) return "Home";
  if (!segments.every((segment) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(segment))) return undefined;

  return segments.map((segment) => {
    const slug = segment.toLowerCase();
    return WEBSITE_PAGE_LABELS[slug] ?? slug.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }).join(" / ");
};

const statusLabel = (status) =>
  clean(String(status || "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()));

/**
 * Birthwave lead -> Runo Website Form payload. Optional properties are
 * omitted (never faked) when absent. birthwave_leads has no city/state
 * columns, so those are not sent.
 */
export const mapBirthwaveLeadToRunoPayload = (lead, context = {}) => {
  const { sourceKey = lead?.source_provider, phoneFormat = "national" } = context;
  const service = clean(lead?.service, 160);
  const pregnancyWeeks = lead?.pregnancy_weeks ? `Pregnancy weeks: ${lead.pregnancy_weeks}` : null;
  const isWebsite = sourceKey === BIRTHWAVE_MAIN_WEBSITE_SOURCE_KEY;
  const submissionPage = isWebsite ? websitePageLabel(context.submissionPage) : undefined;
  const trackedPage = isWebsite ? websitePageLabel(context.landingPage) : undefined;
  const websitePage = submissionPage ? ` — ${submissionPage} Page` : trackedPage ? ` — Tracked Page: ${trackedPage}` : "";
  const payload = {
    your_name: clean(lead?.name, 150),
    your_email: clean(lead?.email, 200),
    your_phone: formatPhoneForRuno(lead?.phone, phoneFormat) || undefined,
    // Keep the requested service separate from the page named in the subject.
    your_message: clean(
      [service ? `Service: ${service}` : null, pregnancyWeeks, context.message ?? lead?.notes].filter(Boolean).join("\n"),
      5000,
    ),
    your_subject: isWebsite
      ? `Birthwave Website Enquiry${websitePage}`
      : `Birthwave ${runoPageLabel(sourceKey)} Landing Page Enquiry`,
    custom_status: statusLabel(lead?.status),
    custom_source: runoSourceLabel(sourceKey),
  };

  return Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined));
};
