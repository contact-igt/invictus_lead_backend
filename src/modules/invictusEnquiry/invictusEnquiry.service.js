import db from "../../database/index.js";
import { Op } from "sequelize";

// Server-side reference generator (IGT- + 6 random alphanumeric characters)
const generateApplicationReference = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let randomStr = "";
  for (let i = 0; i < 6; i++) {
    randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `IGT-${randomStr}`;
};

// Derive slug from role title
export const slugifyRole = (role) => {
  if (!role) return "general";
  return role
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w\-]+/g, "")
    .replace(/\-\-+/g, "-");
};

// URL validator helper
const isValidUrl = (urlStr) => {
  if (!urlStr || typeof urlStr !== "string") return false;
  try {
    const parsed = new URL(urlStr);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (_) {
    return false;
  }
};

// --- GENERAL ENQUIRIES SERVICES ---

export const createGeneralEnquiryPublic = async (payload, clientIp = null) => {
  const { name, mobile, email, industry, applied_for, city, state } = payload;

  if (!name || !mobile || !email || !industry) {
    const error = new Error("Name, mobile, email, and industry are required fields.");
    error.status = 400;
    throw error;
  }

  if (!/^[0-9]{10}$/.test(mobile)) {
    const error = new Error("Mobile number must be exactly 10 digits.");
    error.status = 400;
    throw error;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error("Invalid email address format.");
    error.status = 400;
    throw error;
  }

  return await db.InvictusGeneralEnquiry.create({
    name: name.trim(),
    mobile: mobile.trim(),
    email: email.trim().toLowerCase(),
    industry: industry.trim(),
    applied_for: applied_for || "General Inquiry",
    city: city ? city.trim() : null,
    state: state ? state.trim() : null,
    ip_address: clientIp || payload.ip_address || null,
    status: "New",
  });
};

export const listGeneralEnquiries = async (query = {}) => {
  const page = parseInt(query.page || 1, 10);
  const limit = parseInt(query.limit || 10, 10);
  const offset = (page - 1) * limit;
  const search = query.search ? query.search.trim() : "";
  const status = query.status && !["all", "all statuses"].includes(query.status.trim().toLowerCase()) ? query.status.trim() : "";
  const city = query.city && !["all", "all cities"].includes(query.city.trim().toLowerCase()) ? query.city.trim() : "";
  const state = query.state && !["all", "all states"].includes(query.state.trim().toLowerCase()) ? query.state.trim() : "";
  const sortBy = query.sortBy ? query.sortBy.trim() : "submitted_at";
  const sortOrder = query.sortOrder && query.sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";

  const where = {};
  const andConditions = [];

  if (status) {
    andConditions.push({ status });
  }

  if (city) {
    andConditions.push({
      [Op.or]: [
        { city: city },
        { city: { [Op.like]: `%${city}%` } },
      ],
    });
  }

  if (state) {
    andConditions.push({
      [Op.or]: [
        { state: state },
        { state: { [Op.like]: `%${state}%` } },
        { city: { [Op.like]: `%${state}%` } },
      ],
    });
  }

  if (search) {
    andConditions.push({
      [Op.or]: [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { mobile: { [Op.like]: `%${search}%` } },
        { industry: { [Op.like]: `%${search}%` } },
        { city: { [Op.like]: `%${search}%` } },
        { state: { [Op.like]: `%${search}%` } },
      ],
    });
  }

  if (andConditions.length > 0) {
    where[Op.and] = andConditions;
  }

  const allowedSortColumns = {
    name: "name",
    city: "city",
    state: "state",
    status: "status",
    submitted_at: "submitted_at",
    createdAt: "createdAt",
  };
  const sortColumn = allowedSortColumns[sortBy] || "submitted_at";

  const { rows, count } = await db.InvictusGeneralEnquiry.findAndCountAll({
    where,
    limit,
    offset,
    order: [[sortColumn, sortOrder]],
  });

  return {
    data: rows,
    total: count,
    page,
    totalPages: Math.ceil(count / limit),
  };
};

export const getGeneralLocations = async () => {
  const rows = await db.InvictusGeneralEnquiry.findAll({
    attributes: ["city", "state"],
    raw: true,
  });

  const rawCities = [];
  const rawStates = [];

  rows.forEach((r) => {
    if (r.city && typeof r.city === "string" && r.city.trim() !== "") {
      const parts = r.city.split(",").map((s) => s.trim()).filter(Boolean);
      if (parts.length > 0) rawCities.push(parts[0]);
      if (parts.length > 1 && (!r.state || r.state.trim() === "")) {
        rawStates.push(parts[1]);
      }
    }
    if (r.state && typeof r.state === "string" && r.state.trim() !== "") {
      rawStates.push(r.state.trim());
    }
  });

  const cities = Array.from(new Set(rawCities)).sort((a, b) => a.localeCompare(b));
  const states = Array.from(new Set(rawStates)).sort((a, b) => a.localeCompare(b));

  return { cities, states };
};

export const updateGeneralEnquiry = async (id, payload) => {
  const enquiry = await db.InvictusGeneralEnquiry.findByPk(id);
  if (!enquiry) {
    const error = new Error("General enquiry record not found.");
    error.status = 404;
    throw error;
  }

  const { status, notes } = payload;
  const validStatuses = ["New", "Contacted", "In Progress", "Closed"];
  if (status && !validStatuses.includes(status)) {
    const error = new Error(`Invalid status. Allowed values: ${validStatuses.join(", ")}`);
    error.status = 400;
    throw error;
  }

  if (status) enquiry.status = status;
  if (notes !== undefined) enquiry.notes = notes;
  await enquiry.save();
  return enquiry;
};

// --- CAREERS APPLICATIONS SERVICES ---

export const createCareersApplicationPublic = async (payload) => {
  const {
    role,
    full_name,
    phone,
    email,
    current_city,
    state,
    notice_period,
    experience,
    portfolio_or_showreel,
    resume_or_linkedin,
    tools,
    work_categories,
    workflow_answer,
    ai_usage,
    judgement_answer,
    practical_assessment,
  } = payload;

  // Validation Checks
  if (!role || !full_name || !phone || !email || !current_city || !notice_period || !experience || !portfolio_or_showreel || !tools || !work_categories || !workflow_answer || !ai_usage || !judgement_answer) {
    const error = new Error("All required fields must be provided.");
    error.status = 400;
    throw error;
  }

  if (full_name.trim().length < 2) {
    const error = new Error("Full name must be at least 2 characters.");
    error.status = 400;
    throw error;
  }

  if (!/^[0-9]{10}$/.test(phone.trim())) {
    const error = new Error("Phone number must be exactly 10 digits.");
    error.status = 400;
    throw error;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    const error = new Error("Invalid email address format.");
    error.status = 400;
    throw error;
  }

  if (!isValidUrl(portfolio_or_showreel)) {
    const error = new Error("Portfolio / Showreel must be a valid URL.");
    error.status = 400;
    throw error;
  }

  if (resume_or_linkedin && !isValidUrl(resume_or_linkedin)) {
    const error = new Error("Resume / LinkedIn must be a valid URL.");
    error.status = 400;
    throw error;
  }

  const toolsArray = Array.isArray(tools) ? tools : [tools];
  if (toolsArray.length === 0) {
    const error = new Error("At least one tool must be selected.");
    error.status = 400;
    throw error;
  }

  const categoriesArray = Array.isArray(work_categories) ? work_categories : [work_categories];
  if (categoriesArray.length === 0) {
    const error = new Error("At least one work category must be selected.");
    error.status = 400;
    throw error;
  }

  const judgementText = judgement_answer.trim();
  if (judgementText.length < 120 || judgementText.length > 700) {
    const error = new Error("Judgement answer must be between 120 and 700 characters.");
    error.status = 400;
    throw error;
  }

  // Server-Side Unique Reference Generation
  let application_reference = generateApplicationReference();
  let isUnique = false;
  let attempts = 0;
  while (!isUnique && attempts < 10) {
    const existing = await db.InvictusCareersApplication.findOne({ where: { application_reference } });
    if (!existing) {
      isUnique = true;
    } else {
      application_reference = generateApplicationReference();
      attempts++;
    }
  }

  const role_slug = slugifyRole(role);

  // Screening Flag Rule Engine
  const screening_flags = [];

  const lowerWorkflow = workflow_answer.toLowerCase();
  const isCanvaTools = toolsArray.length === 1 && toolsArray[0].toLowerCase() === "canva";
  if (lowerWorkflow.includes("canva") || isCanvaTools) {
    screening_flags.push("CANVA_ONLY_WORKFLOW");
  }

  if (ai_usage === "ai_primary") {
    screening_flags.push("AI_PRIMARY_WORKFLOW");
  }

  if (judgementText.length < 120) {
    screening_flags.push("SHORT_JUDGEMENT_ANSWER");
  } else if (judgementText.length > 700) {
    screening_flags.push("LONG_JUDGEMENT_ANSWER");
  }

  return await db.InvictusCareersApplication.create({
    application_reference,
    role: role.trim(),
    role_slug,
    full_name: full_name.trim(),
    phone: phone.trim(),
    email: email.trim().toLowerCase(),
    current_city: current_city.trim(),
    state: state ? state.trim() : null,
    notice_period: notice_period.trim(),
    experience,
    portfolio_or_showreel: portfolio_or_showreel.trim(),
    resume_or_linkedin: resume_or_linkedin ? resume_or_linkedin.trim() : null,
    tools: toolsArray,
    work_categories: categoriesArray,
    workflow_answer: workflow_answer.trim(),
    ai_usage,
    judgement_answer: judgementText,
    practical_assessment: practical_assessment || "No",
    screening_flags,
    status: "New",
  });
};

export const listCareersApplications = async (query = {}) => {
  const page = parseInt(query.page || 1, 10);
  const limit = parseInt(query.limit || 10, 10);
  const offset = (page - 1) * limit;
  const search = query.search ? query.search.trim() : "";
  const status = query.status && !["all", "all statuses"].includes(query.status.trim().toLowerCase()) ? query.status.trim() : "";
  const roleSlugFilter = query.role_slug || query.role || "";
  const city = query.city && !["all", "all cities"].includes(query.city.trim().toLowerCase()) ? query.city.trim() : "";
  const state = query.state && !["all", "all states"].includes(query.state.trim().toLowerCase()) ? query.state.trim() : "";
  const sortBy = query.sortBy ? query.sortBy.trim() : "createdAt";
  const sortOrder = query.sortOrder && query.sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";

  const where = {};
  const andConditions = [];

  if (status) {
    andConditions.push({ status });
  }

  if (city) {
    andConditions.push({
      [Op.or]: [
        { current_city: city },
        { current_city: { [Op.like]: `%${city}%` } },
      ],
    });
  }

  if (state) {
    andConditions.push({
      [Op.or]: [
        { state: state },
        { state: { [Op.like]: `%${state}%` } },
        { current_city: { [Op.like]: `%${state}%` } },
      ],
    });
  }

  if (roleSlugFilter && !["all", "all roles"].includes(roleSlugFilter.toLowerCase())) {
    const targetSlug = slugifyRole(roleSlugFilter);
    andConditions.push({
      [Op.or]: [
        { role_slug: targetSlug },
        { role: roleSlugFilter },
        { role: { [Op.like]: `%${roleSlugFilter}%` } },
      ],
    });
  }

  if (search) {
    andConditions.push({
      [Op.or]: [
        { full_name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } },
        { application_reference: { [Op.like]: `%${search}%` } },
        { current_city: { [Op.like]: `%${search}%` } },
        { state: { [Op.like]: `%${search}%` } },
        { role: { [Op.like]: `%${search}%` } },
      ],
    });
  }

  if (andConditions.length > 0) {
    where[Op.and] = andConditions;
  }

  const allowedSortColumns = {
    full_name: "full_name",
    name: "full_name",
    current_city: "current_city",
    city: "current_city",
    state: "state",
    status: "status",
    createdAt: "createdAt",
  };
  const sortColumn = allowedSortColumns[sortBy] || "createdAt";

  const { rows, count } = await db.InvictusCareersApplication.findAndCountAll({
    where,
    limit,
    offset,
    order: [[sortColumn, sortOrder]],
  });

  return {
    data: rows,
    total: count,
    page,
    totalPages: Math.ceil(count / limit),
  };
};

export const getCareersLocations = async () => {
  const rows = await db.InvictusCareersApplication.findAll({
    attributes: ["current_city", "state"],
    raw: true,
  });

  const rawCities = [];
  const rawStates = [];

  rows.forEach((r) => {
    if (r.current_city && typeof r.current_city === "string" && r.current_city.trim() !== "") {
      const parts = r.current_city.split(",").map((s) => s.trim()).filter(Boolean);
      if (parts.length > 0) rawCities.push(parts[0]);
      if (parts.length > 1 && (!r.state || r.state.trim() === "")) {
        rawStates.push(parts[1]);
      }
    }
    if (r.state && typeof r.state === "string" && r.state.trim() !== "") {
      rawStates.push(r.state.trim());
    }
  });

  const cities = Array.from(new Set(rawCities)).sort((a, b) => a.localeCompare(b));
  const states = Array.from(new Set(rawStates)).sort((a, b) => a.localeCompare(b));

  return { cities, states };
};

export const updateCareersApplication = async (id, payload) => {
  const application = await db.InvictusCareersApplication.findByPk(id);
  if (!application) {
    const error = new Error("Careers application record not found.");
    error.status = 404;
    throw error;
  }

  const { status, notes } = payload;
  const validStatuses = ["New", "Shortlisted", "Under Review", "Rejected", "Hired"];
  if (status && !validStatuses.includes(status)) {
    const error = new Error(`Invalid status. Allowed values: ${validStatuses.join(", ")}`);
    error.status = 400;
    throw error;
  }

  if (status) application.status = status;
  if (notes !== undefined) application.notes = notes;
  await application.save();
  return application;
};

// Export Careers Applications as CSV
export const exportCareersApplicationsCSV = async (query = {}) => {
  const search = query.search ? query.search.trim() : "";
  const status = query.status ? query.status.trim() : "";
  const roleSlugFilter = query.role_slug || query.role || "";

  const where = {};
  const andConditions = [];

  if (status) where.status = status;

  if (roleSlugFilter && roleSlugFilter.toLowerCase() !== "all") {
    const targetSlug = slugifyRole(roleSlugFilter);
    andConditions.push({
      [Op.or]: [
        { role_slug: targetSlug },
        { role: roleSlugFilter },
      ],
    });
  }

  if (search) {
    andConditions.push({
      [Op.or]: [
        { full_name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } },
        { application_reference: { [Op.like]: `%${search}%` } },
      ],
    });
  }

  if (andConditions.length > 0) {
    where[Op.and] = andConditions;
  }

  const applications = await db.InvictusCareersApplication.findAll({
    where,
    order: [["createdAt", "DESC"]],
  });

  const headers = [
    "Application Reference",
    "Role",
    "Full Name",
    "Phone",
    "Email",
    "Current City",
    "Notice Period",
    "Experience",
    "Portfolio / Showreel",
    "Resume / LinkedIn",
    "Tools",
    "Work Categories",
    "Workflow Answer",
    "AI Usage",
    "Practical Assessment",
    "Screening Flags",
    "Status",
    "Applied At",
  ];

  const formatCSVCell = (val) => {
    if (val === null || val === undefined) return '""';
    if (Array.isArray(val)) val = val.join("; ");
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = applications.map((app) => [
    formatCSVCell(app.application_reference),
    formatCSVCell(app.role),
    formatCSVCell(app.full_name),
    formatCSVCell(app.phone),
    formatCSVCell(app.email),
    formatCSVCell(app.current_city),
    formatCSVCell(app.notice_period),
    formatCSVCell(app.experience),
    formatCSVCell(app.portfolio_or_showreel),
    formatCSVCell(app.resume_or_linkedin),
    formatCSVCell(app.tools),
    formatCSVCell(app.work_categories),
    formatCSVCell(app.workflow_answer),
    formatCSVCell(app.ai_usage),
    formatCSVCell(app.practical_assessment),
    formatCSVCell(app.screening_flags),
    formatCSVCell(app.status),
    formatCSVCell(new Date(app.createdAt).toISOString()),
  ]);

  const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  return csvContent;
};

export const deleteGeneralEnquiry = async (id) => {
  const enquiry = await db.InvictusGeneralEnquiry.findByPk(id);
  if (!enquiry) {
    const error = new Error("General enquiry record not found.");
    error.status = 404;
    throw error;
  }
  await enquiry.destroy();
  return { success: true, message: "General enquiry record deleted successfully." };
};

export const deleteCareersApplication = async (id) => {
  const application = await db.InvictusCareersApplication.findByPk(id);
  if (!application) {
    const error = new Error("Careers application record not found.");
    error.status = 404;
    throw error;
  }
  await application.destroy();
  return { success: true, message: "Careers application record deleted successfully." };
};
