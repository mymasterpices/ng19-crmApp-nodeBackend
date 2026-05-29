const { google } = require("googleapis");
const dotenv = require("dotenv");
dotenv.config();

/**
 * Robustly formats the private key from environment variables.
 * Handles escaped newlines and potential surrounding quotes.
 */
const formatPrivateKey = (key) => {
  if (!key) return undefined;
  return key.replace(/\\n/g, "\n").replace(/^"(.*)"$/, "$1");
};

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: formatPrivateKey(process.env.GOOGLE_PRIVATE_KEY),
  },
  scopes: SCOPES,
});

const sheets = google.sheets({ version: "v4", auth });

/**
 * Appends a row to the specified Google Sheet.
 * @param {Object} order - The order object containing transaction details.
 */
const appendToSheet = async (order) => {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  if (!spreadsheetId) {
    console.error("Sync Error: GOOGLE_SHEET_ID is missing in .env");
    return;
  }

  const imageUrls =
    Array.isArray(order.imageProduct) && order.imageProduct.length > 0
      ? order.imageProduct.join(", ")
      : "No Images";

  try {
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: spreadsheetId,
      range: "CRMOrders!A:G",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          [
            order.orderNumber || "N/A", // Order Number
            new Date().toLocaleDateString("en-GB"), // Current Date (Sync Date)
            order.party || "N/A", // Party (Customer Name)
            order.salesperson || "N/A", // Salesperson
            order.karigari || "N/A", // Karigar (Bombay etc.)
            order.quantity || 0, // Quantity
            order.purity || "N/A", // Purity
            order.deliveryDate
              ? new Date(order.deliveryDate).toLocaleDateString("en-GB")
              : "N/A", // Delivery Date
            order.goldWeight || "N/A", // Gold Weight
            order.diamondDetails || "N/A", // Diamond Details
            order.stoneDetails || "N/A", // Stone Details
            order.remarks || "N/A", // Remarks (Any Special Instructions)
            imageUrls,
          ],
        ],
      },
    });

    console.log(
      `✅ Sheet Updated: ${response.statusText} (Status: ${response.status})`,
    );
    return response.data;
  } catch (err) {
    // Detailed error logging to distinguish between Auth issues and Permission issues
    if (err.response && err.response.status === 403) {
      console.error(
        "❌ Permission Denied: Share the sheet with the Service Account Email.",
      );
    } else if (err.response && err.response.status === 401) {
      console.error("❌ Auth Error: Check your Private Key and Email in .env.");
    } else {
      console.error("❌ Google Sheet Sync Error:", err.message);
    }
  }
};

const updateSheetRow = async (order) => {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) {
    console.error("Sync Error: GOOGLE_SHEET_ID is missing in .env");
    return;
  }

  try {
    const orderNumber = order.orderNumber;
    if (!orderNumber) return;

    // 1. Get all existing rows from the sheet to find the matching Order Number
    const rangeName = "CRMOrders!A:G";
    const getResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: rangeName,
    });

    const rows = getResponse.data.values || [];
    let rowIndex = -1;

    // Find the row index where Column A matches the orderNumber
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === orderNumber) {
        rowIndex = i + 1; // Google Sheets are 1-indexed
        break;
      }
    }

    const imageUrls =
      Array.isArray(order.imageProduct) && order.imageProduct.length > 0
        ? order.imageProduct.join(", ")
        : "No Images";

    // Prepare the updated row data
    const rowValues = [
      order.orderNumber || "N/A", // Column A: Order Number
      new Date().toLocaleDateString("en-GB"), // Column B: Update Date
      order.party || "N/A", // Column C: Party
      order.salesperson || "N/A", // Column D: Salesperson
      order.karigari || "N/A", // Column E: Karigar
      order.quantity || 0, // Column F: Quantity
      order.purity || "N/A", // Purity
      order.deliveryDate
        ? new Date(order.deliveryDate).toLocaleDateString("en-GB")
        : "N/A", // Column G: Delivery Date
      order.goldWeight || "N/A",
      order.diamondDetails || "N/A",
      order.stoneDetails || "N/A",
      order.remarks || "N/A",
      imageUrls,
    ];

    if (rowIndex !== -1) {
      // 2. Row मिल गई! तो उसी Specific Row को Update करें (e.g., CRMOrders!A5:K5)
      const updateRange = `CRMOrders!A${rowIndex}`;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: updateRange,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [rowValues],
        },
      });
      console.log(
        `✅ Sheet Row Updated for Order: ${orderNumber} at Row: ${rowIndex}`,
      );
    } else {
      // अगर किसी वजह से Row नहीं मिली, तो Back-up के तौर पर New Row Append कर दें
      console.warn(
        `⚠️ Order ${orderNumber} not found in sheet. Appending as new row.`,
      );
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: "CRMOrders!A:G",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [rowValues] },
      });
    }
  } catch (err) {
    console.error("❌ Google Sheet Update Error:", err.message);
  }
};

module.exports = { appendToSheet, updateSheetRow };
