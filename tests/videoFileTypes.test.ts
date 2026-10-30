import { describe, expect, it } from "vitest";
import { VIDEO_FILE_ACCEPT, isVideoFile } from "../src/core/io/videoFileTypes";

describe("the files that are videos (videoFileTypes.ts)", () => {
  it("are told by their type, and - with none or a general one - by the extension of their name", () => {
    expect(isVideoFile({ name: "a.mp4", type: "video/mp4" })).toBe(true);
    expect(isVideoFile({ name: "a.unbekannt", type: "video/x-etwas" })).toBe(true);
    for (const name of ["Film.mkv", "Film.MKV", "clip.webm", "x.avi", "x.hevc", "x.h265", "x.m2ts", "x.mov"]) expect(isVideoFile({ name, type: "" }), name).toBe(true);
    expect(isVideoFile({ name: "x.mkv", type: "application/octet-stream" })).toBe(true);
  });

  it("are not what has another type, or no name of a video", () => {
    expect(isVideoFile({ name: "bild.mkv", type: "image/png" })).toBe(false);
    expect(isVideoFile({ name: "text.txt", type: "" })).toBe(false);
    expect(isVideoFile({ name: "ohne-endung", type: "" })).toBe(false);
  });

  it("have a file field that offers the general type and the extensions - so that an iPad does not grey them out", () => {
    const entries = VIDEO_FILE_ACCEPT.split(",");
    expect(entries[0]).toBe("video/*");
    for (const extension of [".mp4", ".mov", ".mkv", ".webm", ".avi", ".hevc"]) expect(entries).toContain(extension);
    expect(new Set(entries).size).toBe(entries.length);
  });
});
