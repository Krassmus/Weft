/** The edge length of an avatar picture, in pixels - small enough to send to every peer as it is
 * (a few kilobytes), big enough to stay sharp at the 26-32px it is shown at on a high-resolution screen. */
export const AVATAR_SIZE = 96;

/**
 * Turns a picture the user picked into an avatar: the largest centred square of it, scaled down to
 * AVATAR_SIZE and returned as a JPEG data URL (JPEG because every webview can encode it; a
 * transparent picture is flattened onto white). Rejects if the file isn't a picture.
 */
export async function avatarFromFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Das ist keine Bilddatei.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Das Bild lässt sich nicht lesen.");
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Das Bild lässt sich nicht verarbeiten.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}
