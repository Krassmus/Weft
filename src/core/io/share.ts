function asFile(name: string, bytes: Uint8Array): File {
  return new File([bytes as BlobPart], name, { type: "application/zip" });
}

/** Whether this browser (a tablet's web view) can hand a file to the share sheet (Save to Files, AirDrop, Mail, ...). */
export function canShareFile(name: string, bytes: Uint8Array): boolean {
  try {
    return typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [asFile(name, bytes)] });
  } catch {
    return false;
  }
}

/** Opens the share sheet for the file. Has to be called straight from a tap. Resolves false if the person closed the sheet
 * without choosing anything. */
export async function shareFile(name: string, bytes: Uint8Array): Promise<boolean> {
  try {
    await navigator.share({ files: [asFile(name, bytes)], title: name });
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return false;
    throw error;
  }
}
