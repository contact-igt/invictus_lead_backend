const FORMULA_PREFIX_PATTERN = /^[=+-@]/;

export const sanitizeCsvCell = (value) => {
  const normalized = value == null ? "" : String(value);
  return FORMULA_PREFIX_PATTERN.test(normalized)
    ? `'${normalized}`
    : normalized;
};

export const escapeCsvValue = (value) => {
  const sanitized = sanitizeCsvCell(value);
  return `"${sanitized.replace(/"/g, '""')}"`;
};
