const VOCAB_SPREADSHEET_ID = "1I1VLM2fpZAkKCrAbo_YIa8R5lZ64RRxZSykEBjEoovw";
const VOCAB_SHEET_NAME = "Tất cả từ";
const VOCAB_COLUMN_COUNT = 15;

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return jsonResponse_({ ok: false, error: "POST only" });
}

function doPost(e) {
  try {
    const expectedSecret = PropertiesService.getScriptProperties().getProperty("VOCAB_API_SECRET");
    const actualSecret = e && e.parameter ? String(e.parameter.token || "") : "";
    if (!expectedSecret || actualSecret !== expectedSecret) {
      return jsonResponse_({ ok: false, error: "Unauthorized" });
    }

    const spreadsheet = SpreadsheetApp.openById(VOCAB_SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(VOCAB_SHEET_NAME);
    if (!sheet) return jsonResponse_({ ok: false, error: `Missing sheet: ${VOCAB_SHEET_NAME}` });

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return jsonResponse_({ ok: false, error: "Vocabulary sheet has no data rows" });

    const values = sheet.getRange(1, 1, lastRow, VOCAB_COLUMN_COUNT).getDisplayValues();
    return jsonResponse_({
      ok: true,
      values,
      rowCount: Math.max(0, values.length - 1),
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: error && error.message ? String(error.message) : String(error)
    });
  }
}
