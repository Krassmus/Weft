/**
 * The files Weft takes as videos. The list is of extensions as well as `video/*`, because the type alone is not enough where a file is picked: the file picker of an iPad
 * greys out every file whose type the system does not know as a video - an mkv, a webm or a raw .hevc that someone downloaded - so they could not be chosen at all, to
 * be converted (see io/videoTranscode.ts). A dropped file of such a kind has no type either (an empty one), so it is told by its name.
 */
const VIDEO_EXTENSIONS = ["mp4", "m4v", "mov", "mkv", "webm", "avi", "wmv", "flv", "mpg", "mpeg", "ts", "mts", "m2ts", "3gp", "ogv", "hevc", "h265"];

/** What the `accept` of the file field for a video says: every kind of video, and the extensions that are known by name only. */
export const VIDEO_FILE_ACCEPT = ["video/*", ...VIDEO_EXTENSIONS.map((extension) => `.${extension}`)].join(",");

/** Whether `file` is a video: by its type, or - where it has none or a general one - by its name. */
export function isVideoFile(file: { name: string; type: string }): boolean {
  if (file.type.startsWith("video/")) return true;
  if (file.type !== "" && file.type !== "application/octet-stream") return false;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXTENSIONS.includes(extension);
}
