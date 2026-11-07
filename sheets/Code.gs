/**
 * Friends of Figma Adelaide: saves microsite answers to this Google Sheet.
 *
 * Paste this into Extensions > Apps Script in the Sheet, then deploy it as a web app:
 * Execute as: Me. Who has access: Anyone. See microsite/README.md for the steps.
 */

/** @OnlyCurrentDoc Limits this script's access to this one Sheet, not all of your spreadsheets. */

var HEADERS = ['Submitted at', 'Name', 'Role', 'Figma experience', 'Wants', 'Other ideas'];

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    // Only bots fill in this hidden field, so accept it quietly and save nothing.
    if (data.website) return reply_({ ok: true });
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
    if (sheet.getFrozenRows() === 0) sheet.setFrozenRows(1);
    sheet.appendRow(toRow_(data, new Date()));
    return reply_({ ok: true });
  } catch (err) {
    return reply_({ ok: false, error: 'Could not save that response.' });
  }
}

function toRow_(data, now) {
  var wants = Array.isArray(data.wants) ? data.wants.slice(0, 20) : [];
  return [
    now,
    clean_(data.name, 80),
    clean_(data.role, 80),
    clean_(data.experience, 80),
    clean_(wants.map(String).join(', '), 1000),
    clean_(data.other, 1000),
  ];
}

// Answers come from the public, so never let one run as a spreadsheet formula.
function clean_(value, maxLength) {
  var text = String(value === undefined || value === null ? '' : value).trim().slice(0, maxLength);
  return /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
}

function reply_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
