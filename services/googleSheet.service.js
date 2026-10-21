const { google } = require("googleapis");

/**
 * Env vars used (rename here if yours differ):
 *   GOOGLE_SHEET_ID
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   GOOGLE_PRIVATE_KEY            (the service account's private_key; "\n" escapes are handled)
 *   GOOGLE_SHEET_TAB              (optional, defaults to FeedbackForm)
 *
 * Sheet columns (row 1 must be the header, in this order):
 *   A created_At | B updated_At | C Name | D Mobile | E Address
 *   F Date of Birth | G Date of Anniversary | H PAN No | I Rating | J Remarks
 */
const TAB = "Feedback";
const SHEET_ID = process.env.FEEDBBACK_GOOGLE_SHEET_ID;
const MOBILE_COL = "D";

let sheetsClient = null;
function getSheets() {
  if (sheetsClient) return sheetsClient;

  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  sheetsClient = google.sheets({ version: "v4", auth });
  return sheetsClient;
}

const range = (a1) => `'${TAB}'!${a1}`;

/** India wall-clock parts for a given date value, or null if invalid */
function istParts(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d)) return null;

  return Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
}

/**
 * Google Sheets serial number (days since 1899-12-30) using India wall-clock
 * time. A real number + a date format on the column = a real date in the sheet.
 */
function toSerial(value, withTime = false) {
  const p = istParts(value);
  if (!p) return "";
  const hour = p.hour === "24" ? 0 : +p.hour; // some runtimes return "24" at midnight
  const ms = withTime
    ? Date.UTC(+p.year, +p.month - 1, +p.day, hour, +p.minute, +p.second)
    : Date.UTC(+p.year, +p.month - 1, +p.day);
  return ms / 86400000 + 25569;
}

/** Stop user text from being interpreted as a formula under USER_ENTERED */
function safeText(v) {
  const s = String(v ?? "");
  return /^[=+\-@]/.test(s) ? `'${s}` : s;
}

/** Mobile as a number (no apostrophe); keep text if it has a leading 0 or non-digits */
function mobileValue(m) {
  const s = String(m || "").trim();
  return /^[1-9]\d*$/.test(s) ? Number(s) : s;
}

/** Row values in sheet column order */
function toRow(fb) {
  return [
    toSerial(fb.createdAt, true), // A created_At
    toSerial(fb.updatedAt, true), // B updated_At
    safeText(fb.name), // C Name
    mobileValue(fb.mobile), // D Mobile
    safeText(fb.address), // E Address
    toSerial(fb.dob), // F Date of Birth
    toSerial(fb.anniversary), // G Date of Anniversary
    safeText(fb.pan), // H PAN No
    fb.rating ?? "", // I Rating
    safeText(fb.remarks), // J Remarks
  ];
}

async function appendRow(feedback) {
  await getSheets().spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: range("A:J"),
    valueInputOption: "USER_ENTERED", // numbers/serials are stored as real numbers and dates
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [toRow(feedback)] },
  });
}

/** 1-based row number of the LAST row with this mobile, or null */
async function findRowByMobile(mobile) {
  const res = await getSheets().spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: range(`${MOBILE_COL}:${MOBILE_COL}`),
    valueRenderOption: "UNFORMATTED_VALUE", // numbers come back as 9999988888, not formatted text
  });
  const rows = res.data.values || [];
  for (let i = rows.length - 1; i >= 1; i--) {
    // i = 0 is the header
    if (String(rows[i][0] ?? "").trim() === String(mobile).trim()) return i + 1;
  }
  return null;
}

/** Update B:J of an existing row (created_At in column A is left untouched) */
async function updateRow(rowNumber, feedback) {
  await getSheets().spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: range(`B${rowNumber}:J${rowNumber}`),
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [toRow(feedback).slice(1)] },
  });
}

/**
 * ONE-TIME helper (optional): sets display formats so serial numbers show as
 * dates. Not called automatically. Run it once, e.g.
 *   require("./googleSheet").formatColumns().then(() => console.log("done"));
 * You can also set the same formats by hand in the sheet (Format > Number).
 */
async function formatColumns() {
  const sheets = getSheets();

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: "sheets.properties(sheetId,title)",
  });
  const tab = meta.data.sheets.find((s) => s.properties.title === TAB);
  if (!tab) throw new Error(`Tab "${TAB}" not found in the spreadsheet`);
  const sheetId = tab.properties.sheetId;

  const fmtReq = (col, type, pattern) => ({
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: 1, // skip header
        startColumnIndex: col,
        endColumnIndex: col + 1,
      },
      cell: { userEnteredFormat: { numberFormat: { type, pattern } } },
      fields: "userEnteredFormat.numberFormat",
    },
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        fmtReq(0, "DATE_TIME", "dd/mm/yyyy hh:mm:ss"), // A created_At
        fmtReq(1, "DATE_TIME", "dd/mm/yyyy hh:mm:ss"), // B updated_At
        fmtReq(3, "NUMBER", "0"), // D Mobile
        fmtReq(5, "DATE", "dd/mm/yyyy"), // F Date of Birth
        fmtReq(6, "DATE", "dd/mm/yyyy"), // G Date of Anniversary
      ],
    },
  });
}

/**
 * Sync one feedback to the sheet. Never throws: the database is the source of
 * truth, so a Sheets failure is logged and must not fail the user's save.
 */
async function syncFeedbackToSheet(feedback, mode = "create") {
  try {
    if (!SHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
      console.warn(
        "[GoogleSheet] Skipped: missing GOOGLE_SHEET_ID or service account email",
      );
      return;
    }

    if (mode === "update") {
      const row = await findRowByMobile(feedback.mobile);
      if (row) return await updateRow(row, feedback);
      // no matching row yet -> fall through and add it
    }
    await appendRow(feedback);
  } catch (err) {
    console.error(
      "[GoogleSheet] Sync failed:",
      err.response?.data?.error || err.message,
    );
  }
}

module.exports = { syncFeedbackToSheet, formatColumns };
