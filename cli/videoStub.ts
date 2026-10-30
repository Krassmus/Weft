// Stands in for src/core/io/videoTranscode.ts in the command line tool: nothing here converts video.
export function isFfmpegAvailable(): Promise<boolean> {
  return Promise.resolve(false);
}
export function isNativeConversionAvailable(): Promise<boolean> {
  return Promise.resolve(false);
}
export function isVideoConversionAvailable(): Promise<boolean> {
  return Promise.resolve(false);
}
export function transcodeToH264(): Promise<never> {
  return Promise.reject(new Error("Videos lassen sich im Kommandozeilenwerkzeug nicht umwandeln."));
}
export function soundDroppedOf(): null {
  return null;
}
export function useTranscodeStatus(): never {
  throw new Error("not available");
}
