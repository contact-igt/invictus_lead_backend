const MASTER_SHEET_NAME = "All Submissions";

const HEADERS = [
  "Received At",
  "Name",
  "Contact Number",
  "Email",
  "Service",
  "Care Area / Topic",
  "Preferred Contact Method",
  "Previous Caesareans",
  "Message",
  "Consent",
  "Status",
  "Page",
  "Submission ID",
  "Service Code"
];

const SERVICE_TABS = {
  "General Contact": [
    "general-contact",
    "contact"
  ],

  "Fertility & Preconception": [
    "fertility-preconception",
    "preconception-health",
    "conscious-pregnancy-prep"
  ],

  "Vaginismus": [
    "vaginismus"
  ],

  "Pregnancy & Antenatal": [
    "pregnancy-antenatal-care",
    "nutrition-pregnancy",
    "garbh-sanskar"
  ],

  "Birth Preparation": [
    "birth-preparation",
    "birth-planning",
    "partner-preparation",
    "doula-support"
  ],

  "Natural Birth": [
    "natural-birth",
    "normal-birth-delivery",
    "water-birth"
  ],

  "VBAC": [
    "vbac"
  ],

  "Postpartum Care": [
    "postpartum-care",
    "postpartum-mental-health",
    "early-parenting-support"
  ],

  "Lactation": [
    "lactation",
    "feeding-growth"
  ],

  "Newborn & Paediatric": [
    "newborn-care",
    "newborn-pediatric-care",
    "parenting-guidance"
  ],

  "Gynaecology": [
    "gynaecology",
    "adolescent-health",
    "pcos-menstrual-health",
    "menopause-care",
    "preventive-health"
  ],

  "Nutrition & Wellbeing": [
    "nutrition-emotional-wellbeing",
    "mental-emotional-wellbeing",
    "weight-metabolic-wellness"
  ]
};

const SERVICE_LABELS = {
  "general-contact": "General Contact",
  "contact": "General Contact",

  "fertility-preconception": "Fertility & Preconception",
  "preconception-health": "Preconception Health",
  "conscious-pregnancy-prep": "Conscious Pregnancy Preparation",

  "vaginismus": "Vaginismus & Intimate Wellness",

  "pregnancy-antenatal-care": "Pregnancy & Antenatal Care",
  "nutrition-pregnancy": "Nutrition During Pregnancy",
  "garbh-sanskar": "Garbh Sanskar",

  "birth-preparation": "Birth Preparation & Childbirth Education",
  "birth-planning": "Birth Planning",
  "partner-preparation": "Partner Preparation",
  "doula-support": "Doula Support",

  "natural-birth": "Natural Birth",
  "normal-birth-delivery": "Normal Birth & Delivery",
  "water-birth": "Water Birth",

  "vbac": "VBAC",

  "postpartum-care": "Postpartum Recovery & Care",
  "postpartum-mental-health": "Postpartum Mental Health",
  "early-parenting-support": "Early Parenting Support",

  "lactation": "Lactation & Breastfeeding Support",
  "feeding-growth": "Feeding & Growth",

  "newborn-care": "Newborn Care",
  "newborn-pediatric-care": "Newborn & Paediatric Care",
  "parenting-guidance": "Parenting Guidance",

  "gynaecology": "Gynaecology",
  "adolescent-health": "Adolescent Health",
  "pcos-menstrual-health": "PCOS & Menstrual Health",
  "menopause-care": "Menopause Care",
  "preventive-health": "Preventive Health",

  "nutrition-emotional-wellbeing":
    "Nutrition & Emotional Wellbeing",
  "mental-emotional-wellbeing":
    "Mental & Emotional Wellbeing",
  "weight-metabolic-wellness":
    "Weight & Metabolic Wellness",

  // Doctor enquiries remain in All Submissions only.
  "doctor-enquiry": "Doctor Enquiry"
};

/**
 * Run this function manually once before deploying.
 */
function setupSheets() {
  const spreadsheet = getSpreadsheet();
  const masterSheet = getOrCreateMasterSheet(spreadsheet);

  setupMasterSheet(masterSheet);

  Object.entries(SERVICE_TABS).forEach(
    ([tabName, serviceCodes]) => {
      const sheet = getOrCreateSheet(
        spreadsheet,
        tabName
      );

      setupServiceView(sheet, serviceCodes);
    }
  );

  spreadsheet.setActiveSheet(masterSheet);
}

/**
 * Receives website submissions.
 */
function doPost(e) {
  try {
    const payload = JSON.parse(
      e.postData?.contents || "{}"
    );

    const properties =
      PropertiesService.getScriptProperties();

    const expectedSecret =
      properties.getProperty("FORM_SECRET");

    if (
      !expectedSecret ||
      payload.secret !== expectedSecret
    ) {
      return jsonResponse({
        ok: false,
        error: "Unauthorized"
      });
    }

    /*
     * Honeypot field.
     * This must remain empty for genuine submissions.
     */
    if (payload.website) {
      return jsonResponse({ ok: true });
    }

    const validationError =
      validateSubmission(payload);

    if (validationError) {
      return jsonResponse({
        ok: false,
        error: validationError
      });
    }

    const spreadsheet = getSpreadsheet();

    const masterSheet =
      getOrCreateMasterSheet(spreadsheet);

    setupMasterSheet(masterSheet);

    const serviceCode = cleanText(
      payload.serviceCode,
      100
    );

    const lock = LockService.getScriptLock();

    lock.waitLock(10000);

    try {
      masterSheet.appendRow([
        new Date(),
        safeCell(payload.name, 120),
        safeCell(
          payload.phone || payload.contact,
          120
        ),
        safeCell(payload.email, 254),
        "Website Enquiry",
        safeCell(getCareArea(payload) || SERVICE_LABELS[serviceCode], 500),
        safeCell(payload.contactMethod, 100),
        safeCell(payload.caesareanCount, 50),
        safeCell(payload.message, 5000),
        payload.consent === true ? "Yes" : "No",
        "New",
        safeCell(payload.page, 500),
        Utilities.getUuid(),
        safeCell(serviceCode, 100)
      ]);
    } finally {
      lock.releaseLock();
    }

    return jsonResponse({
      ok: true,
      message: "Enquiry recorded successfully."
    });
  } catch (error) {
    console.error(error);

    return jsonResponse({
      ok: false,
      error: "The enquiry could not be saved."
    });
  }
}

/**
 * Opens the spreadsheet using the ID saved
 * in Apps Script Properties.
 */
function getSpreadsheet() {
  const spreadsheetId =
    PropertiesService
      .getScriptProperties()
      .getProperty("SPREADSHEET_ID");

  if (!spreadsheetId) {
    throw new Error(
      "SPREADSHEET_ID has not been configured."
    );
  }

  return SpreadsheetApp.openById(
    spreadsheetId
  );
}

/**
 * Uses the blank first sheet for All Submissions
 * when possible.
 */
function getOrCreateMasterSheet(spreadsheet) {
  const existing =
    spreadsheet.getSheetByName(
      MASTER_SHEET_NAME
    );

  if (existing) {
    return existing;
  }

  const sheets = spreadsheet.getSheets();

  if (
    sheets.length === 1 &&
    sheets[0].getLastRow() === 0
  ) {
    sheets[0].setName(MASTER_SHEET_NAME);
    return sheets[0];
  }

  return spreadsheet.insertSheet(
    MASTER_SHEET_NAME
  );
}

function getOrCreateSheet(
  spreadsheet,
  sheetName
) {
  return (
    spreadsheet.getSheetByName(sheetName) ||
    spreadsheet.insertSheet(sheetName)
  );
}

/**
 * Creates and formats the master sheet.
 */
function setupMasterSheet(sheet) {
  sheet
    .getRange(1, 1, 1, HEADERS.length)
    .setValues([HEADERS]);

  sheet.setFrozenRows(1);

  sheet
    .getRange(1, 1, 1, HEADERS.length)
    .setFontWeight("bold")
    .setBackground("#CA9585")
    .setFontColor("#FFFFFF")
    .setHorizontalAlignment("left");

  sheet
    .getRange("A:A")
    .setNumberFormat(
      "dd mmm yyyy, hh:mm"
    );

  const widths = [
    170, // Received At
    180, // Name
    170, // Contact
    220, // Email
    240, // Service
    260, // Care Area / Topic
    190, // Preferred Contact
    160, // Previous Caesareans
    400, // Message
    100, // Consent
    120, // Status
    260, // Page
    240, // Submission ID
    190  // Service Code
  ];

  widths.forEach((width, index) => {
    sheet.setColumnWidth(index + 1, width);
  });

  /*
   * Add the enquiry-status dropdown.
   */
  const statusValidation =
    SpreadsheetApp
      .newDataValidation()
      .requireValueInList(
        [
          "New",
          "Contacted",
          "Appointment Booked",
          "Completed",
          "Closed"
        ],
        true
      )
      .setAllowInvalid(false)
      .build();

  sheet
    .getRange(
      2,
      11,
      Math.max(sheet.getMaxRows() - 1, 1),
      1
    )
    .setDataValidation(statusValidation);

  /*
   * Recreate the filter so it covers future rows.
   */
  const existingFilter = sheet.getFilter();

  if (existingFilter) {
    existingFilter.remove();
  }

  sheet
    .getRange(
      1,
      1,
      sheet.getMaxRows(),
      HEADERS.length
    )
    .createFilter();

  /*
   * Hide Page, Submission ID and Service Code.
   */
  sheet.hideColumns(12, 3);
}

/**
 * Creates a read-only filtered service view.
 *
 * The service tabs display only columns A–K.
 * Page, Submission ID and Service Code are omitted.
 */
function setupServiceView(
  sheet,
  serviceCodes
) {
  const existingFilter = sheet.getFilter();

  if (existingFilter) {
    existingFilter.remove();
  }

  sheet.clear();

  const conditions = serviceCodes
    .map(
      code =>
        `N = '${escapeQueryValue(code)}'`
    )
    .join(" or ");

  const formula =
    `=QUERY('${MASTER_SHEET_NAME}'!A:N,` +
    `"select A,B,C,D,E,F,G,H,I,J,K ` +
    `where ${conditions}",1)`;

  sheet.getRange("A1").setFormula(formula);
  sheet.setFrozenRows(1);

  sheet
    .getRange(1, 1, 1, 11)
    .setFontWeight("bold")
    .setBackground("#CA9585")
    .setFontColor("#FFFFFF")
    .setHorizontalAlignment("left");

  sheet
    .getRange("A:A")
    .setNumberFormat(
      "dd mmm yyyy, hh:mm"
    );

  const widths = [
    170, // Received At
    180, // Name
    170, // Contact
    220, // Email
    240, // Service
    260, // Care Area / Topic
    190, // Preferred Contact
    160, // Previous Caesareans
    400, // Message
    100, // Consent
    120  // Status
  ];

  widths.forEach((width, index) => {
    sheet.setColumnWidth(index + 1, width);
  });
}

/**
 * Finds the care-area field used by each form.
 */
function getCareArea(payload) {
  return (
    payload.careArea ||
    payload.serviceHelp ||
    payload.topic ||
    payload.stage ||
    payload.helpReason ||
    payload.helpOption ||
    payload.concern ||
    payload.discussionTopic ||
    ""
  );
}

/**
 * Basic server-side validation.
 */
function validateSubmission(payload) {
  if (!cleanText(payload.name, 120)) {
    return "Name is required.";
  }

  if (
    !cleanText(
      payload.phone || payload.contact,
      120
    )
  ) {
    return (
      "A phone number or contact detail " +
      "is required."
    );
  }

  if (
    !cleanText(payload.serviceCode, 100)
  ) {
    return "The form source is missing.";
  }

  if (payload.consent !== true) {
    return "Consent is required.";
  }

  return "";
}

function cleanText(
  value,
  maximumLength
) {
  if (
    value === undefined ||
    value === null
  ) {
    return "";
  }

  return String(value)
    .trim()
    .slice(0, maximumLength);
}

/**
 * Prevents submitted content from being interpreted
 * as a Google Sheets formula.
 */
function safeCell(
  value,
  maximumLength
) {
  const text = cleanText(
    value,
    maximumLength
  );

  return /^[=+\-@]/.test(text)
    ? `'${text}`
    : text;
}

function escapeQueryValue(value) {
  return String(value)
    .replace(/'/g, "\\'");
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(
      JSON.stringify(data)
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );
}
