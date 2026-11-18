/**
 * Hands the browser a file to save. Safari ignores a click on an anchor that is not in the document, and cancels the
 * download when the object URL is revoked in the same tick as the click, so "Download my data" did nothing there:
 * the anchor is attached for the click and the URL is revoked a moment later.
 */
export function saveBlobAsFile(blob: Blob, filename: string, revokeAfterMs = 1000): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), revokeAfterMs);
  }
}
