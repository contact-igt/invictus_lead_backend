const CLIENT_KEY_ALIASES = {
  pixel_eye: "pixeleye",
  vlslaw: "vls_law",
};

export const SUPPORTED_CLIENT_MODULES = [
  "pixeleye",
  "vls_law",
  "aarav_eye_care",
  "antardrashti_netralaya",
  "rio",
  'shanti_eye_tech',
  'phoenix_fitness',
];

export const normalizeClientKey = (key) => {
  if (key === undefined || key === null) return "";

  const normalized = String(key)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  return CLIENT_KEY_ALIASES[normalized] || normalized;
};

export const extractClientModuleKey = (key) => {
  const normalized = normalizeClientKey(key);
  if (!normalized) return "";

  const matchedModule = SUPPORTED_CLIENT_MODULES.find(
    (moduleKey) =>
      normalized === moduleKey || normalized.startsWith(`${moduleKey}_`),
  );

  return matchedModule || "";
};

export const isSupportedClientKey = (key) =>
  Boolean(extractClientModuleKey(key));

