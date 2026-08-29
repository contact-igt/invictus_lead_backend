/**
 * Normalization + validation helpers for free-text location fields
 * (city / state) collected from public forms.
 *
 * These are used on write (so the database only ever stores clean values)
 * and by the filter-options service / backfill script.
 */

// Values that are technically non-empty but carry no real location meaning.
const INVALID_TOKENS = new Set([
  "",
  "-",
  "--",
  "n/a",
  "na",
  "none",
  "null",
  "nil",
  "undefined",
  "city",
  "state",
  "test",
  "xxx",
  ".",
]);

/**
 * Trim, collapse internal whitespace and convert to Title Case.
 * Hyphen / slash separated words are each capitalised ("navi-mumbai" -> "Navi-Mumbai").
 * Returns "" for anything that is not a usable location value.
 */
export const normalizeLocationValue = (raw) => {
  if (raw === null || raw === undefined) return "";

  const collapsed = String(raw).trim().replace(/\s+/g, " ");
  if (!collapsed) return "";
  if (INVALID_TOKENS.has(collapsed.toLowerCase())) return "";
  // Reject values with no letters at all (e.g. "123", "----").
  if (!/[a-z]/i.test(collapsed)) return "";

  return collapsed
    .toLowerCase()
    .replace(/([a-zÀ-ɏ])([a-zÀ-ɏ]*)/gi, (_m, first, rest) => first.toUpperCase() + rest);
};

/** True when `raw` normalizes to a usable location value. */
export const isValidLocationValue = (raw) => normalizeLocationValue(raw).length > 0;

/**
 * Small, deliberately short list of common Indian city aliases / renames.
 * Keys are lower-cased; values are the canonical Title-Cased city name.
 * This is NOT meant to cover every Indian city — Geoapify handles the general
 * case. It only collapses the handful of spellings we actually see duplicated.
 */
export const CITY_ALIASES = {
  bangalore: "Bengaluru",
  bengaluru: "Bengaluru",
  bengalore: "Bengaluru",
  trichy: "Tiruchirappalli",
  tiruchirapalli: "Tiruchirappalli",
  tiruchirappalli: "Tiruchirappalli",
  tiruchchirappalli: "Tiruchirappalli",
  madras: "Chennai",
  chennai: "Chennai",
  bombay: "Mumbai",
  mumbai: "Mumbai",
  calcutta: "Kolkata",
  kolkata: "Kolkata",
  gurgaon: "Gurugram",
  gurugram: "Gurugram",
  pondicherry: "Puducherry",
  puducherry: "Puducherry",
  manglore: "Mangaluru",
  mangalore: "Mangaluru",
  mangaluru: "Mangaluru",
  mysore: "Mysuru",
  mysuru: "Mysuru",
  trivandrum: "Thiruvananthapuram",
  thiruvananthapuram: "Thiruvananthapuram",
  calicut: "Kozhikode",
  kozhikode: "Kozhikode",
  cochin: "Kochi",
  kochi: "Kochi",
  vizag: "Visakhapatnam",
  visakhapatnam: "Visakhapatnam",
  pune: "Pune",
  poona: "Pune",
  jhanshi: "Jhansi",
  jhansi: "Jhansi",
  srivilliputur: "Srivilliputhur",
  srivilliputhur: "Srivilliputhur",
  kanniyakumari: "Kanyakumari",
  kanyakumari: "Kanyakumari",
  tirunelveli: "Tirunelveli",
  "new delhi": "Delhi",
  "north delhi": "Delhi",
  "south delhi": "Delhi",
  delhi: "Delhi",
  // Chennai localities that applicants sometimes type as their "city".
  nungambakkam: "Chennai",
  vadapalani: "Chennai",
  velachery: "Chennai",
  "anna nagar": "Chennai",
  adyar: "Chennai",
  guindy: "Chennai",
  porur: "Chennai",
  tondiarpet: "Chennai",
  tondairpet: "Chennai",
  maduravoyal: "Chennai",
  "maduravoyal chennai": "Chennai",
  // Bengaluru localities.
  whitefield: "Bengaluru",
  "electronic city": "Bengaluru",
  koramangala: "Bengaluru",
  marathahalli: "Bengaluru",
  indiranagar: "Bengaluru",
};

/**
 * Deterministic city -> state map for the cities that actually turn up in
 * Invictus applications (India, TN-heavy) plus the common metros / tier-2
 * cities. Lets us resolve a state WITHOUT calling Geoapify — used as the
 * offline fallback on write and by the backfill script.
 * Keys are canonical Title-Cased city names (post-alias).
 */
export const CITY_STATE = {
  // Tamil Nadu
  Chennai: "Tamil Nadu", Coimbatore: "Tamil Nadu", Madurai: "Tamil Nadu",
  Salem: "Tamil Nadu", Tiruchirappalli: "Tamil Nadu", Erode: "Tamil Nadu",
  Tirunelveli: "Tamil Nadu", Vellore: "Tamil Nadu", Thoothukudi: "Tamil Nadu",
  Dindigul: "Tamil Nadu", Thanjavur: "Tamil Nadu", Kanchipuram: "Tamil Nadu",
  Cuddalore: "Tamil Nadu", Kumbakonam: "Tamil Nadu", Karur: "Tamil Nadu",
  Namakkal: "Tamil Nadu", Hosur: "Tamil Nadu", Nagercoil: "Tamil Nadu",
  Kanyakumari: "Tamil Nadu", Villupuram: "Tamil Nadu", Virudhunagar: "Tamil Nadu",
  Dharmapuri: "Tamil Nadu", Krishnagiri: "Tamil Nadu", Sriperumbudur: "Tamil Nadu",
  Srivilliputhur: "Tamil Nadu", Tenkasi: "Tamil Nadu", Arantangi: "Tamil Nadu",
  Mayiladuthurai: "Tamil Nadu", Chengalpattu: "Tamil Nadu",
  Tirupathur: "Tamil Nadu", Tiruvannamalai: "Tamil Nadu", Kallakurichi: "Tamil Nadu",
  Chidambaram: "Tamil Nadu", Pollachi: "Tamil Nadu", Pudukkottai: "Tamil Nadu",
  Ulundurpet: "Tamil Nadu", Sivakasi: "Tamil Nadu", Rajapalayam: "Tamil Nadu",
  Ambur: "Tamil Nadu", Ranipet: "Tamil Nadu", Ariyalur: "Tamil Nadu",
  Perambalur: "Tamil Nadu", Nagapattinam: "Tamil Nadu", Ramanathapuram: "Tamil Nadu",
  Theni: "Tamil Nadu", Palani: "Tamil Nadu", Gudiyatham: "Tamil Nadu",
  Udhagamandalam: "Tamil Nadu", Ooty: "Tamil Nadu",
  // Karnataka
  Bengaluru: "Karnataka", Mangaluru: "Karnataka", Mysuru: "Karnataka",
  Hubli: "Karnataka", Belagavi: "Karnataka", Davangere: "Karnataka",
  Ballari: "Karnataka", Tumakuru: "Karnataka", Shivamogga: "Karnataka",
  Udupi: "Karnataka", Kalaburagi: "Karnataka",
  // Kerala
  Kochi: "Kerala", Thiruvananthapuram: "Kerala", Kozhikode: "Kerala",
  Thrissur: "Kerala", Kannur: "Kerala", Kollam: "Kerala", Palakkad: "Kerala",
  Alappuzha: "Kerala", Kottayam: "Kerala", Malappuram: "Kerala", Kasaragod: "Kerala",
  // Telangana / Andhra Pradesh
  Hyderabad: "Telangana", Warangal: "Telangana", Nizamabad: "Telangana",
  Karimnagar: "Telangana", Khammam: "Telangana",
  Visakhapatnam: "Andhra Pradesh", Vijayawada: "Andhra Pradesh", Guntur: "Andhra Pradesh",
  Nellore: "Andhra Pradesh", Kurnool: "Andhra Pradesh", Anantapur: "Andhra Pradesh",
  Tirupati: "Andhra Pradesh", Kadapa: "Andhra Pradesh", Rajahmundry: "Andhra Pradesh",
  // Maharashtra
  Mumbai: "Maharashtra", Pune: "Maharashtra", Nagpur: "Maharashtra",
  Nashik: "Maharashtra", "Navi Mumbai": "Maharashtra", Thane: "Maharashtra",
  Aurangabad: "Maharashtra", Solapur: "Maharashtra", Kolhapur: "Maharashtra",
  // Gujarat
  Ahmedabad: "Gujarat", Surat: "Gujarat", Vadodara: "Gujarat", Rajkot: "Gujarat",
  Bharuch: "Gujarat", Anand: "Gujarat", Bhavnagar: "Gujarat", Jamnagar: "Gujarat",
  Gandhinagar: "Gujarat",
  // North / others
  Delhi: "Delhi", Jaipur: "Rajasthan", Jodhpur: "Rajasthan", Udaipur: "Rajasthan",
  Kota: "Rajasthan", Ajmer: "Rajasthan",
  Jhansi: "Uttar Pradesh", Lucknow: "Uttar Pradesh", Kanpur: "Uttar Pradesh",
  Noida: "Uttar Pradesh", Ghaziabad: "Uttar Pradesh", Agra: "Uttar Pradesh",
  Varanasi: "Uttar Pradesh", Prayagraj: "Uttar Pradesh", Meerut: "Uttar Pradesh",
  Mohali: "Punjab", Ludhiana: "Punjab", Amritsar: "Punjab", Jalandhar: "Punjab",
  Patiala: "Punjab",
  Puducherry: "Puducherry",
  Kolkata: "West Bengal", Howrah: "West Bengal", Siliguri: "West Bengal",
  Durgapur: "West Bengal",
  Indore: "Madhya Pradesh", Bhopal: "Madhya Pradesh", Jabalpur: "Madhya Pradesh",
  Gwalior: "Madhya Pradesh",
  Gurugram: "Haryana", Faridabad: "Haryana", Panipat: "Haryana", Hisar: "Haryana",
  Patna: "Bihar", Gaya: "Bihar",
  Bhubaneswar: "Odisha", Cuttack: "Odisha", Rourkela: "Odisha",
  Ranchi: "Jharkhand", Jamshedpur: "Jharkhand", Dhanbad: "Jharkhand",
  Raipur: "Chhattisgarh", Bhilai: "Chhattisgarh",
  Guwahati: "Assam", Dehradun: "Uttarakhand", Haridwar: "Uttarakhand",
  Shimla: "Himachal Pradesh", Chandigarh: "Chandigarh",
  Panaji: "Goa", Margao: "Goa",
};

/** Canonical state for a (possibly messy) city value, or "" if unknown. */
export const stateForCity = (rawCity) => CITY_STATE[canonicalizeCity(rawCity)] || "";

/** Canonical Indian state / UT names, keyed by their lower-cased form. */
const INDIAN_STATES = new Set(
  [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa",
    "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
    "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
    "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
    "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands",
    "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir",
    "Ladakh", "Lakshadweep", "Puducherry",
  ].map((s) => s.toLowerCase()),
);

/** Returns the canonical state name if `raw` is a recognised Indian state, else "". */
export const canonicalizeState = (raw) => {
  const norm = normalizeLocationValue(raw);
  return norm && INDIAN_STATES.has(norm.toLowerCase()) ? norm : "";
};

/**
 * Normalize a city value and apply the alias map.
 * "  bangalore " -> "Bengaluru", "trichy" -> "Tiruchirappalli".
 */
export const canonicalizeCity = (raw) => {
  const norm = normalizeLocationValue(raw);
  if (!norm) return "";
  return CITY_ALIASES[norm.toLowerCase()] || norm;
};
