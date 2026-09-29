/** m:ss (no hours - nothing here plays anywhere near that long), used for a video's own playback
 * position wherever it's shown to the author (VideoStopPointDialog's markers, and the page
 * timeline's own stop-point nodes - see syncPageTimelineEvents in document/pageTimeline.ts). */
export function formatTimeMMSS(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
