import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { appCacheDir, join } from "@tauri-apps/api/path";
import { exists, mkdir, readFile, remove, writeFile } from "@tauri-apps/plugin-fs";
import { Command } from "@tauri-apps/plugin-shell";
import { createId } from "../id";
import { isTauri } from "./fileIO";
import { tr } from "../i18n/tr";

/**
 * Two ways to convert, tried in this order: the system's own (AVFoundation, src-tauri/src/native_video.rs - on the iPad and the Mac: nothing to install, hardware
 * quick, and the only way on the iPad, where an app cannot start another program) and an ffmpeg of the computer (all that Windows and Linux have, and what reads
 * the formats AVFoundation does not: webm, mkv). A file the system does not read falls through to ffmpeg where there is one.
 *
 * ffmpeg isn't bundled with Weft - that would mean shipping a ~50-80MB binary per platform (mac/
 * Windows/Linux, each its own build) plus real licensing homework (H.264 *encoding* needs
 * libx264, which is GPL; fine to invoke as a separate process the way this does, murkier to
 * actually redistribute inside the app). Instead this looks for an ffmpeg the user already has -
 * common on a dev machine, installable in one line elsewhere (`brew install ffmpeg`, `winget
 * install ffmpeg`, `apt install ffmpeg`). A GUI app on macOS doesn't inherit the shell's PATH (no
 * .zshrc et al gets sourced), so a bare "ffmpeg" lookup alone would miss a perfectly real
 * Homebrew install - these three scope entries (see capabilities/default.json) are tried in
 * order, the first one that actually runs wins.
 */
const FFMPEG_CANDIDATES = ["ffmpeg-path", "ffmpeg-homebrew-arm", "ffmpeg-homebrew-intel"];

// undefined = not checked yet this session; null = checked, none worked.
let cachedCommandName: string | null | undefined;

async function findFfmpegCommandName(): Promise<string | null> {
  if (cachedCommandName !== undefined) return cachedCommandName;
  for (const name of FFMPEG_CANDIDATES) {
    try {
      const result = await Command.create(name, ["-version"]).execute();
      if (result.code === 0) {
        cachedCommandName = name;
        return name;
      }
      console.warn(`ffmpeg-Kandidat "${name}" lief, aber mit Exit-Code ${result.code}:`, result.stderr.slice(-300));
    } catch (err) {
      // Not installed at this candidate's location - try the next one, but log why in case
      // *none* of them work: a scope/capability mismatch fails every candidate identically and
      // looks from here exactly like "ffmpeg isn't installed", which it might not actually be.
      console.warn(`ffmpeg-Kandidat "${name}" nicht nutzbar:`, err);
    }
  }
  cachedCommandName = null;
  return null;
}

export async function isFfmpegAvailable(): Promise<boolean> {
  if (!isTauri()) return false;
  return (await findFfmpegCommandName()) !== null;
}

// undefined = not asked yet this session.
let cachedNativeAvailable: boolean | undefined;

/** Whether the system itself can convert a video here (the iPad, the Mac: see src-tauri/src/native_video.rs). */
export async function isNativeConversionAvailable(): Promise<boolean> {
  if (!isTauri()) return false;
  if (cachedNativeAvailable === undefined) cachedNativeAvailable = await invoke<boolean>("native_video_conversion_available").catch(() => false);
  return cachedNativeAvailable;
}

/** Whether a video can be converted here at all: by the system, or by an ffmpeg of the computer. */
export async function isVideoConversionAvailable(): Promise<boolean> {
  return (await isNativeConversionAvailable()) || (await isFfmpegAvailable());
}

interface TranscodeStatus {
  active: boolean;
  fileName: string | null;
  /** 0-1, or null while ffmpeg hasn't reported enough to estimate progress yet. */
  progress: number | null;
}

const IDLE_STATUS: TranscodeStatus = { active: false, fileName: null, progress: null };

/** Global, not per-block: only one transcode ever runs at a time in practice (each is awaited
 * before the next upload can start), and a single shared status lets any part of the UI show
 * it without threading a callback through setBlockVideo/setLayoutBlockVideo/addVideoBlockToPage/
 * addVideoBlockToLayout and both of Canvas.tsx's/BlockPanel.tsx's call sites. */
export const useTranscodeStatus = create<TranscodeStatus>(() => IDLE_STATUS);

async function ensureCacheDir(): Promise<string> {
  const dir = await join(await appCacheDir(), "video-transcode");
  if (!(await exists(dir))) await mkdir(dir, { recursive: true });
  return dir;
}

function fileExtension(fileName: string): string {
  const match = /\.([a-zA-Z0-9]+)$/.exec(fileName);
  return match ? match[1] : "bin";
}

function parseTimeToSeconds(hhmmss: string): number {
  const parts = hhmmss.split(":");
  const [h, m, s] = [Number(parts[0]), Number(parts[1]), parseFloat(parts[2])];
  return h * 3600 + m * 60 + s;
}

const DURATION_PATTERN = /Duration:\s*(\d+:\d{2}:\d{2}\.\d+)/;
const TIME_PATTERN = /\btime=\s*(\d+:\d{2}:\d{2}\.\d+)/g;

/** Runs ffmpeg and resolves once it exits successfully, rejecting with its own stderr tail
 * otherwise. Progress is parsed straight out of ffmpeg's own stderr chatter (its normal
 * "Duration: …" banner up front, then a running "time=…" as it encodes) rather than a separate
 * ffprobe pass - one process instead of two, and ffmpeg prints both anyway. Uses spawn(), not
 * the simpler execute(): execute() only hands back stdout/stderr once the whole process has
 * already finished, which is no good for a progress bar on something that can take minutes. */
function runFfmpeg(commandName: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = Command.create(commandName, args);
    let stderrBuffer = "";
    let durationSeconds: number | null = null;

    command.stderr.on("data", (chunk) => {
      stderrBuffer += chunk;
      if (durationSeconds === null) {
        const match = DURATION_PATTERN.exec(stderrBuffer);
        if (match) durationSeconds = parseTimeToSeconds(match[1]);
      }
      if (durationSeconds !== null) {
        // The pattern is global and re-run against the whole accumulated buffer each time, so
        // grab the *last* match rather than whatever the regex cursor happens to land on.
        TIME_PATTERN.lastIndex = 0;
        let lastMatch: RegExpExecArray | null = null;
        let current: RegExpExecArray | null;
        while ((current = TIME_PATTERN.exec(stderrBuffer))) lastMatch = current;
        if (lastMatch) {
          const fraction = Math.min(1, parseTimeToSeconds(lastMatch[1]) / durationSeconds);
          useTranscodeStatus.setState({ progress: fraction });
        }
      }
    });
    command.on("error", (err) => reject(new Error(String(err))));
    command.on("close", (payload) => {
      if (payload.code === 0) resolve();
      else reject(new Error(`ffmpeg beendet mit Code ${payload.code}: ${stderrBuffer.slice(-800)}`));
    });
    command.spawn().catch(reject);
  });
}

// For a converted video that came out without the sound of the original (see soundDroppedOf).
const droppedSounds = new WeakMap<File, string>();

/**
 * The codec of the sound that a conversion had to leave out ("A_DTS", "A_OPUS", ...), if `converted` - a file transcodeToH264 returned - has no sound because of it.
 * The system converts the sound of most files, but not of every kind (see mkv_remux.rs): the video is then made without, and whoever added it is told.
 */
export function soundDroppedOf(converted: File): string | null {
  return droppedSounds.get(converted) ?? null;
}

/** The conversion by the system (see native_video.rs), with its progress from the event it sends. Returns the codec of the sound it left out, if it did. */
async function runNative(inputPath: string, outputPath: string): Promise<string | null> {
  const unlisten = await listen<number>("weft://video-progress", (event) => useTranscodeStatus.setState({ progress: Math.min(1, Math.max(0, event.payload)) }));
  try {
    const result = await invoke<{ soundDropped?: string | null } | null>("native_video_to_h264", { input: inputPath, output: outputPath });
    return result?.soundDropped ?? null;
  } finally {
    unlisten();
  }
}

/**
 * Re-encodes a video file to H.264/AAC MP4 - by the system (see isNativeConversionAvailable), else via the local ffmpeg (see isFfmpegAvailable). For a
 * file probeVideo (document/actions.ts) couldn't confirm as playable, or one in a codec not every browser plays (see videoCodec.ts), typically an HEVC/H.265
 * export from an iPhone or Mac. H.264 is the one video codec every
 * mainstream browser and OS plays without a fuss, so this is what makes the exported module
 * actually portable rather than just working on whichever machine uploaded it.
 *
 * -pix_fmt yuv420p flattens whatever the source used (including 10-bit HDR, which some players
 * can't handle at all) down to the one pixel format every player supports - a real but
 * acceptable loss of HDR range in exchange for playing everywhere. -movflags +faststart moves
 * the file's index to the front so it can start playing before it's fully downloaded/loaded,
 * same as a normal web-served MP4.
 */
export async function transcodeToH264(file: File): Promise<File> {
  const native = await isNativeConversionAvailable();
  const commandName = await findFfmpegCommandName();
  if (!native && !commandName) throw new Error(tr("ui.ffmpeg_was_not_found"));

  const dir = await ensureCacheDir();
  const jobId = createId();
  const inputPath = await join(dir, `${jobId}-in.${fileExtension(file.name)}`);
  const outputPath = await join(dir, `${jobId}-out.mp4`);

  useTranscodeStatus.setState({ active: true, fileName: file.name, progress: null });
  try {
    await writeFile(inputPath, new Uint8Array(await file.arrayBuffer()));
    let converted = false;
    let nativeError: unknown = null;
    let soundDropped: string | null = null;
    if (native) {
      try {
        soundDropped = await runNative(inputPath, outputPath);
        converted = true;
      } catch (err) {
        // (A file the system does not read: ffmpeg, if there is one, tries it.)
        nativeError = err;
        console.warn("Umwandlung durch das System fehlgeschlagen:", err);
        await remove(outputPath).catch(() => {});
        useTranscodeStatus.setState({ progress: null });
      }
    }
    if (!converted) {
      if (!commandName) {
        // (The system's own words for it are "The operation could not be completed" and the like: said so that it can be understood.)
        const said = nativeError instanceof Error ? nativeError.message : String(nativeError);
        throw new Error(tr("ui.video_system_cannot_read", { extension: fileExtension(file.name), said }));
      }
      await runFfmpeg(commandName, [
        "-y",
        "-i",
        inputPath,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        outputPath,
      ]);
    }
    const bytes = await readFile(outputPath);
    const outName = `${file.name.replace(/\.[^.]+$/, "")}.mp4`;
    const result = new File([bytes], outName, { type: "video/mp4" });
    if (soundDropped) droppedSounds.set(result, soundDropped);
    return result;
  } finally {
    useTranscodeStatus.setState(IDLE_STATUS);
    await remove(inputPath).catch(() => {});
    await remove(outputPath).catch(() => {});
  }
}
