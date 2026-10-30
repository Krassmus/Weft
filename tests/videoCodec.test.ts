import { describe, expect, it } from "vitest";
import { isNotEverywherePlayable, sniffVideoCodec, videoCodecOfMoov } from "../src/core/io/videoCodec";

const ascii = (text: string) => Uint8Array.from([...text].map((char) => char.charCodeAt(0)));
const u32 = (value: number) => Uint8Array.from([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
const zeros = (length: number) => new Uint8Array(length);
const join = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};
const box = (type: string, ...parts: Uint8Array[]) => {
  const body = join(...parts);
  return join(u32(8 + body.length), ascii(type), body);
};
/** A track of the given kind ("vide", "soun") whose first sample entry is `codec`. */
const track = (handler: string, codec: string) =>
  box("trak", box("mdia", box("hdlr", zeros(8), ascii(handler), zeros(12)), box("minf", box("stbl", box("stsd", zeros(4), u32(1), box(codec, zeros(78)))))));
const moov = (...tracks: Uint8Array[]) => box("moov", box("mvhd", zeros(100)), ...tracks);
const blobOf = (...parts: Uint8Array[]) => new Blob([join(...parts)]);
const ftyp = box("ftyp", ascii("isom"), zeros(4), ascii("isomiso2"));

describe("the codec of a video file (videoCodec.ts)", () => {
  it("reads the sample entry of the video track out of a moov", () => {
    expect(videoCodecOfMoov(join(moov(track("vide", "avc1"))).slice(8))).toBe("avc1");
    expect(videoCodecOfMoov(moov(track("vide", "hvc1")).slice(8))).toBe("hvc1");
    expect(videoCodecOfMoov(moov(track("vide", "apch")).slice(8))).toBe("apch");
  });

  it("is not taken in by the second handler of a MOV (the data handler in minf, \"url \")", () => {
    const quickTime = (codec: string) =>
      box("trak", box("mdia", box("hdlr", zeros(8), ascii("vide"), zeros(12)), box("minf", box("hdlr", zeros(8), ascii("url "), zeros(12)), box("stbl", box("stsd", zeros(4), u32(1), box(codec, zeros(78)))))));
    expect(videoCodecOfMoov(moov(quickTime("hvc1")).slice(8))).toBe("hvc1");
    expect(videoCodecOfMoov(moov(box("trak", box("mdia", box("hdlr", zeros(8), ascii("soun"), zeros(12)), box("minf", box("hdlr", zeros(8), ascii("url "), zeros(12)), box("stbl", box("stsd", zeros(4), u32(1), box("mp4a", zeros(28)))))))).slice(8))).toBeNull();
  });

  it("takes the video track, not the first one: a sound is no video, whatever comes first", () => {
    expect(videoCodecOfMoov(moov(track("soun", "mp4a"), track("vide", "hev1")).slice(8))).toBe("hev1");
    expect(videoCodecOfMoov(moov(track("soun", "mp4a")).slice(8))).toBeNull();
    expect(videoCodecOfMoov(moov().slice(8))).toBeNull();
  });

  it("finds the moov of a file wherever it is: in front, at the end behind a large mdat, behind a box of more than 4 GB", async () => {
    const mdat = box("mdat", zeros(5000));
    expect(await sniffVideoCodec(blobOf(ftyp, moov(track("vide", "avc1")), mdat))).toBe("avc1");
    expect(await sniffVideoCodec(blobOf(ftyp, mdat, moov(track("vide", "hvc1"))))).toBe("hvc1");
    // (A box whose size is in the eight bytes after its type: size field 1.)
    const large = join(u32(1), ascii("mdat"), u32(0), u32(16 + 300), zeros(300));
    expect(await sniffVideoCodec(blobOf(ftyp, large, moov(track("vide", "dvh1"))))).toBe("dvh1");
    // (A box that goes on to the end of the file: size field 0.)
    expect(await sniffVideoCodec(blobOf(ftyp, moov(track("vide", "hvc1")), join(u32(0), ascii("mdat"), zeros(100))))).toBe("hvc1");
  });

  it("says nothing about a file that is no MP4 or MOV, is cut off, or has no video", async () => {
    // (A webm begins with the EBML header: 1A 45 DF A3.)
    expect(await sniffVideoCodec(blobOf(Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3]), zeros(2000)))).toBeNull();
    expect(await sniffVideoCodec(blobOf(ftyp, box("mdat", zeros(100))))).toBeNull();
    expect(await sniffVideoCodec(blobOf(ftyp, moov(track("soun", "mp4a"))))).toBeNull();
    expect(await sniffVideoCodec(blobOf(ftyp, moov(track("vide", "avc1")).slice(0, 60)))).toBeNull();
    expect(await sniffVideoCodec(blobOf())).toBeNull();
    expect(await sniffVideoCodec(blobOf(zeros(7)))).toBeNull();
  });

  it("calls the codecs not every browser plays: HEVC, ProRes, MPEG-4 part 2 - not H.264, and not what is not known", () => {
    for (const codec of ["hvc1", "hev1", "dvh1", "dvhe", "apch", "apcn", "ap4h", "mp4v"]) expect(isNotEverywherePlayable(codec), codec).toBe(true);
    for (const codec of ["avc1", "avc3", "vp09", "av01", "jpeg", null]) expect(isNotEverywherePlayable(codec), String(codec)).toBe(false);
  });
});
