const stripNonDigits = (value) => String(value || "").replace(/\D/g, "");

export const normalizePixelEyePhoneNumber = (phone) => {
  const digits = stripNonDigits(phone);
  if (!digits) {
    return null;
  }

  if (digits.length === 10) {
    return `91${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("0")) {
    return `91${digits.slice(1)}`;
  }

  if (digits.length === 12 && digits.startsWith("91")) {
    return digits;
  }

  if (digits.length > 12 && digits.startsWith("91")) {
    return `91${digits.slice(-10)}`;
  }

  if (digits.length > 10) {
    const last10 = digits.slice(-10);
    if (last10.length === 10) {
      return `91${last10}`;
    }
  }

  return null;
};

export const getPixelEyePhoneDigits = stripNonDigits;
