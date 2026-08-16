// ── downloadFile ─────────────────────────────────────────────────────────
//
// Triggers a browser download of `content` as a file named `filename`,
// served with the given `mimeType`. Shared by every export button (CSV
// roster export, debug log JSON export) so the blob/anchor/revoke
// boilerplate exists in exactly one place.

export function downloadFile(
  content: string,
  mimeType: string,
  filename: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
