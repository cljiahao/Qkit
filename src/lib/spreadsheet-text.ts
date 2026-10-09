/** Keep untrusted text literal when a CSV is opened in a spreadsheet. */
export function spreadsheetText(value: string): string {
  return /^[\s\u0000-\u0008\u000e-\u001f]*[=+@-]/.test(value) ||
    /^[\t\r\n]/.test(value)
    ? "'" + value
    : value;
}
