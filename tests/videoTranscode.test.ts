import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The ways a video is converted (io/videoTranscode.ts): by the system (the Rust command native_video_to_h264) and by an ffmpeg of the computer - with what the
 * Tauri side does replaced by stand-ins, so that what is decided here is which of the two is asked, in which order, and what is left of a failure.
 */
const calls: string[] = [];
let nativeAvailable = true;
let nativeFails: string | null = null;
let ffmpegWorks = true;
let ffmpegFails = false;
const files = new Map<string, Uint8Array>();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args?: { input: string; output: string }) => {
    calls.push(`invoke:${command}`);
    if (command === "native_video_conversion_available") return nativeAvailable;
    if (command === "native_video_to_h264") {
      if (nativeFails) throw new Error(nativeFails);
      files.set(args!.output, new Uint8Array([1, 2, 3, 4]));
      return undefined;
    }
    throw new Error(`unexpected ${command}`);
  }),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_event: string, handler: (event: { payload: number }) => void) => {
    handler({ payload: 0.5 });
    return () => {};
  }),
}));
vi.mock("@tauri-apps/api/path", () => ({ appCacheDir: async () => "/cache", join: async (...parts: string[]) => parts.join("/") }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: async () => true,
  mkdir: async () => {},
  writeFile: async (path: string, bytes: Uint8Array) => void files.set(path, bytes),
  readFile: async (path: string) => {
    const bytes = files.get(path);
    if (!bytes) throw new Error(`no ${path}`);
    return bytes;
  },
  remove: async (path: string) => void files.delete(path),
}));
vi.mock("@tauri-apps/plugin-shell", () => ({
  Command: {
    create: (name: string, args: string[]) => {
      const listeners: Record<string, (payload: unknown) => void> = {};
      return {
        execute: async () => {
          calls.push(`ffmpeg-check:${name}`);
          if (!ffmpegWorks) throw new Error("not found");
          return { code: 0, stderr: "" };
        },
        stderr: { on: () => {} },
        on: (event: string, handler: (payload: unknown) => void) => void (listeners[event] = handler),
        spawn: async () => {
          calls.push(`ffmpeg-run:${name}`);
          const output = args[args.length - 1];
          if (ffmpegFails) listeners.close?.({ code: 1 });
          else {
            files.set(output, new Uint8Array([9, 9]));
            listeners.close?.({ code: 0 });
          }
        },
      };
    },
  },
}));
vi.mock("../src/core/io/fileIO", () => ({ isTauri: () => true }));

async function load() {
  vi.resetModules();
  // (With its extension: the name alone is the stand-in of the command line tool, see vitest.config.ts.)
  return import("../src/core/io/videoTranscode.ts");
}
const video = () => new File([new Uint8Array([7, 7, 7])], "Urlaub.MOV", { type: "video/quicktime" });

beforeEach(() => {
  calls.length = 0;
  files.clear();
  nativeAvailable = true;
  nativeFails = null;
  ffmpegWorks = true;
  ffmpegFails = false;
});

describe("converting a video to H.264", () => {
  it("is possible where the system converts, or an ffmpeg is there - and not where neither is", async () => {
    let m = await load();
    expect(await m.isVideoConversionAvailable()).toBe(true);
    nativeAvailable = false;
    m = await load();
    expect(await m.isVideoConversionAvailable()).toBe(true);
    ffmpegWorks = false;
    m = await load();
    expect(await m.isVideoConversionAvailable()).toBe(false);
    expect(await m.isNativeConversionAvailable()).toBe(false);
  });

  it("is done by the system first (nothing else is started), the result is an MP4 of the name of the file, and what was written to the cache is gone", async () => {
    const m = await load();
    const result = await m.transcodeToH264(video());
    expect(result.name).toBe("Urlaub.mp4");
    expect(result.type).toBe("video/mp4");
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(calls.filter((call) => call.startsWith("ffmpeg-run"))).toEqual([]);
    expect(calls).toContain("invoke:native_video_to_h264");
    expect(files.size).toBe(0);
    expect(m.useTranscodeStatus.getState().active).toBe(false);
  });

  it("shows the progress the system reports while it works", async () => {
    const m = await load();
    const seen: (number | null)[] = [];
    const stop = m.useTranscodeStatus.subscribe((state) => seen.push(state.progress));
    await m.transcodeToH264(video());
    stop();
    expect(seen).toContain(0.5);
  });

  it("goes on with ffmpeg where the system does not read the file", async () => {
    nativeFails = "Cannot Open";
    const m = await load();
    const result = await m.transcodeToH264(video());
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(new Uint8Array([9, 9]));
    expect(calls.indexOf("invoke:native_video_to_h264")).toBeLessThan(calls.findIndex((call) => call.startsWith("ffmpeg-run")));
  });

  it("uses ffmpeg alone where there is no conversion by the system", async () => {
    nativeAvailable = false;
    const m = await load();
    const result = await m.transcodeToH264(video());
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(new Uint8Array([9, 9]));
    expect(calls).not.toContain("invoke:native_video_to_h264");
  });

  it("tells what the system said when it fails and there is no ffmpeg to try", async () => {
    nativeFails = "Cannot Open";
    ffmpegWorks = false;
    const m = await load();
    // (In words that can be understood, with what the system said at the end.)
    await expect(m.transcodeToH264(video())).rejects.toThrow(/\.MOV.*Cannot Open/);
    expect(files.size).toBe(0);
    expect(m.useTranscodeStatus.getState().active).toBe(false);
  });

  it("is refused where nothing can convert", async () => {
    nativeAvailable = false;
    ffmpegWorks = false;
    const m = await load();
    await expect(m.transcodeToH264(video())).rejects.toThrow();
  });

  it("tells ffmpeg's failure when the system did not read the file and ffmpeg fails as well", async () => {
    nativeFails = "Cannot Open";
    ffmpegFails = true;
    const m = await load();
    await expect(m.transcodeToH264(video())).rejects.toThrow(/ffmpeg/);
    expect(files.size).toBe(0);
  });
});
