/**
 * Hand a blob to the browser as a download.
 *
 * Shared by the three places that produce files — report runs, table exports
 * and asset documents — so the Safari revoke timing below is fixed once rather
 * than rediscovered each time.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Released on the next tick — revoking synchronously can cancel the download
  // in Safari before it has started reading.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** The filename the server asked for, or a fallback. */
export function filenameFromDisposition(disposition: unknown, fallback: string): string {
  return /filename="?([^";]+)"?/.exec(String(disposition ?? ''))?.[1] ?? fallback;
}
