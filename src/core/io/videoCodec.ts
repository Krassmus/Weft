/**
 * Which codec a video file is in, read out of the file itself - for an MP4 or MOV (the ISO base media file format: a tree of boxes, with the codec named in
 * `moov/trak/mdia/minf/stbl/stsd` of the video track). Anything else (a webm, an mkv, an avi) gives null: nothing is said about it here.
 *
 * Why: whether this computer plays a video (see probeVideo in document/actions.ts) is not whether the people the module goes to will. An iPhone records HEVC, which
 * Safari - and so the editor on a Mac or an iPad - plays without a word, and which Chrome and Firefox on a Windows computer often cannot. So a video in such a codec
 * is converted to H.264 where Weft can convert, whether it plays here or not (see needsPortableConversion).
 */

/** The codecs of a video track that not every browser plays: HEVC (H.265, also Dolby Vision), the ProRes family and MPEG-4 part 2. */
const NOT_EVERYWHERE = new Set(["hvc1", "hev1", "dvh1", "dvhe", "apch", "apcn", "apcs", "apco", "ap4h", "ap4x", "mp4v"]);

/** Whether a video track of this codec (see sniffVideoCodec) is one that not every browser plays. */
export function isNotEverywherePlayable(codec: string | null): boolean {
  return codec !== null && NOT_EVERYWHERE.has(codec);
}

// The boxes that hold other boxes on the way from moov to the sample description.
const CONTAINERS = new Set(["trak", "mdia", "minf", "stbl"]);
// A moov that is larger than this is not read (the table of every sample of a very long video is a few megabytes at most).
const MAX_MOOV_BYTES = 64 * 1024 * 1024;
// The top level of a file has a handful of boxes; one that has a lot more is not what this reads.
const MAX_TOP_LEVEL_BOXES = 256;

const fourcc = (bytes: Uint8Array, at: number) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
const uint32 = (bytes: Uint8Array, at: number) => ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;

/**
 * The codec of the first video track in the bytes of a `moov` box (without its own header): the name of the first sample entry of the first track whose handler is
 * "vide" ("avc1" for H.264, "hvc1" or "hev1" for HEVC, ...). Null if there is none.
 */
export function videoCodecOfMoov(moov: Uint8Array): string | null {
  let found: string | null = null;
  // handler: the kind of the track being walked ("vide", "soun", ...) once its hdlr has been seen; entry: the codec named by its stsd.
  function walk(start: number, end: number, track: { handler: string | null; entry: string | null }) {
    let at = start;
    while (at + 8 <= end && found === null) {
      const size = uint32(moov, at);
      const type = fourcc(moov, at + 4);
      if (size < 8 || at + size > end) return;
      const body = at + 8;
      const boxEnd = at + size;
      if (type === "trak") {
        const own = { handler: null as string | null, entry: null as string | null };
        walk(body, boxEnd, own);
        if (own.handler === "vide" && own.entry) found = own.entry;
      } else if (CONTAINERS.has(type)) walk(body, boxEnd, track);
      // (The handler of the media comes first, in mdia. A MOV of QuickTime has a second one in minf, for the data - "url " - which is none of the track's.)
      else if (type === "hdlr" && body + 12 <= boxEnd && track.handler === null) track.handler = fourcc(moov, body + 8);
      // stsd: version and flags (4), the number of entries (4), then the entries, each beginning with its size (4) and its codec (4).
      else if (type === "stsd" && body + 16 <= boxEnd && uint32(moov, body + 4) > 0) track.entry = fourcc(moov, body + 12);
      at = boxEnd;
    }
  }
  walk(0, moov.length, { handler: null, entry: null });
  return found;
}

/**
 * The codec of the video track of a file, if it is an MP4 or MOV and says so - found by going through the boxes of its top level (a header of a few bytes each, so
 * even a file of gigabytes is not read, only its moov, wherever that is: in front, or at the end as a camera writes it).
 */
export async function sniffVideoCodec(file: Blob): Promise<string | null> {
  const read = async (from: number, length: number) => new Uint8Array(await file.slice(from, from + length).arrayBuffer());
  let at = 0;
  for (let count = 0; count < MAX_TOP_LEVEL_BOXES && at + 8 <= file.size; count++) {
    const header = await read(at, 16);
    if (header.length < 8) return null;
    let size = uint32(header, 0);
    const type = fourcc(header, 4);
    let headerBytes = 8;
    if (size === 1) {
      // A box of more than 4 GB: its size is in the next eight bytes.
      if (header.length < 16) return null;
      size = uint32(header, 8) * 2 ** 32 + uint32(header, 12);
      headerBytes = 16;
    } else if (size === 0) size = file.size - at; // up to the end of the file
    if (size < headerBytes) return null;
    if (type === "moov") {
      const length = size - headerBytes;
      if (length > MAX_MOOV_BYTES) return null;
      return videoCodecOfMoov(await read(at + headerBytes, length));
    }
    at += size;
  }
  return null;
}
