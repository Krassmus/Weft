import { useEffect, useMemo, useState } from "react";

/** How many bars the schematic waveform has (one per slice of the sound). */
const BAR_COUNT = 96;
/** A longer file is not decoded (it would take a lot of memory just to draw a picture) - the dialog then simply has no waveform. */
const MAX_DECODED_BYTES = 60 * 1024 * 1024;

/** The loudness of each of `BAR_COUNT` equal slices of the sound at `url`, 0 to 1 (the loudest slice is 1); null while it is being read,
 * or when it can not be (a format the browser does not decode, a file that is too long). */
function useWaveformPeaks(url: string | undefined): number[] | null {
  const [peaks, setPeaks] = useState<number[] | null>(null);
  useEffect(() => {
    setPeaks(null);
    if (!url) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(url);
        const bytes = await response.arrayBuffer();
        if (cancelled || bytes.byteLength > MAX_DECODED_BYTES) return;
        // (An offline context decodes without making a real audio device - and without the autoplay rules of one.)
        const decoded = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes);
        if (cancelled) return;
        const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
        const slice = Math.max(1, Math.floor(decoded.length / BAR_COUNT));
        const loudness: number[] = [];
        for (let bar = 0; bar < BAR_COUNT; bar++) {
          let peak = 0;
          const end = Math.min(decoded.length, (bar + 1) * slice);
          for (const data of channels) {
            for (let i = bar * slice; i < end; i++) peak = Math.max(peak, Math.abs(data[i]));
          }
          loudness.push(peak);
        }
        const loudest = Math.max(...loudness, 1e-6);
        setPeaks(loudness.map((value) => value / loudest));
      } catch {
        // No waveform then - nothing the author has to do about it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);
  return peaks;
}

/**
 * A small schematic waveform of a sound: one bar per slice, as high as it is loud, mirrored around the middle. Sits over the timeline of
 * the time marks dialog (above its line); the part the sound has played is in the colour of the line. `progress` is 0 to 1.
 */
export function Waveform({ url, progress }: { url: string | undefined; progress: number }) {
  const peaks = useWaveformPeaks(url);
  // The bars as one path (each a rounded-looking slim rectangle): 100 units high, the quietest still a few units so that nothing is empty.
  const path = useMemo(() => {
    if (!peaks) return "";
    return peaks
      .map((peak, i) => {
        const height = Math.max(6, peak * 100);
        return `M${i + 0.15} ${50 - height / 2}h0.7v${height}h-0.7z`;
      })
      .join("");
  }, [peaks]);
  if (!peaks) return null;
  const clip = `inset(0 ${Math.max(0, Math.min(100, (1 - progress) * 100))}% 0 0)`;
  return (
    <div className="weft-stop-point-wave" aria-hidden="true">
      <svg viewBox={`0 0 ${BAR_COUNT} 100`} preserveAspectRatio="none" className="weft-stop-point-wave-base">
        <path d={path} />
      </svg>
      <svg viewBox={`0 0 ${BAR_COUNT} 100`} preserveAspectRatio="none" className="weft-stop-point-wave-played" style={{ clipPath: clip }}>
        <path d={path} />
      </svg>
    </div>
  );
}
