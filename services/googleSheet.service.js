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

/** Format in India time: dd/MM/yyyy or dd/MM/yyyy HH:mm:ss */
function fmt(value, withTime = false) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d)) return "";

  const parts = Object.fromEntries(
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

  const date = `${parts.day}/${parts.month}/${parts.year}`;
  return withTime
    ? `${date} ${parts.hour}:${parts.minute}:${parts.second}`
    : date;
}

/** Row values in sheet column order */
function toRow(fb) {
  return [
    fmt(fb.createdAt, true), // A created_At
    fmt(fb.updatedAt, true), // B updated_At
    fb.name || "", // C Name
    String(fb.mobile || ""), // D Mobile
    fb.address || "", // E Address
    fmt(fb.dob), // F Date of Birth
    fmt(fb.anniversary), // G Date of Anniversary
    fb.pan || "", // H PAN No
    fb.rating ?? "", // I Rating
    fb.remarks || "", // J Remarks
  ];
}

async function appendRow(feedback) {
  await getSheets().spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: range("A:J"),
    valueInputOption: "RAW", // keeps mobile / dates as plain text
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [toRow(feedback)] },
  });
}

/** 1-based row number of the LAST row with this mobile, or null */
async function findRowByMobile(mobile) {
  const res = await getSheets().spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: range(`${MOBILE_COL}:${MOBILE_COL}`),
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
    valueInputOption: "RAW",
    requestBody: { values: [toRow(feedback).slice(1)] },
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

module.exports = { syncFeedbackToSheet };
