import { useEffect, useRef, useState } from "react";

/**
 * The bar on a tile of the start screen while its module opens. Opening a large module (one with a film in it) keeps the window
 * busy for seconds, during which nothing seems to happen after the click - so the tile shows that the click was understood. The bar is
 * an estimate and has nothing to do with how far the opening really is: below SMALL_BYTES there is none, above it the bar is full
 * after SECONDS_PER_100_MB for each 100 MB, and from then on it pulses until the module is open.
 */
export const SMALL_BYTES = 10 * 1024 * 1024;
const SECONDS_PER_100_MB = 3;

export function estimatedSeconds(bytes: number): number {
  return (bytes / (100 * 1024 * 1024)) * SECONDS_PER_100_MB;
}

/** After the bar has been drawn: the work that follows holds the window (and so the drawing) up. */
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0))));
}

export interface OpenProgress {
  /** The tile that is being opened, if its bar is showing. */
  active: { key: string; seconds: number } | null;
  /** True from the click until the module is open - a second click does nothing meanwhile. */
  busy: boolean;
  /** Runs `task` (opening the module of `bytes` size, or an unknown size) with the bar on the tile `key` where there is one. */
  run: (key: string, bytes: number | null, task: () => Promise<void>) => Promise<void>;
}

export function useOpenProgress(): OpenProgress {
  const [active, setActive] = useState<OpenProgress["active"]>(null);
  const busyRef = useRef(false);
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  async function run(key: string, bytes: number | null, task: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      if (bytes !== null && bytes > SMALL_BYTES) {
        setActive({ key, seconds: estimatedSeconds(bytes) });
        await nextPaint();
      }
      await task();
    } finally {
      busyRef.current = false;
      if (aliveRef.current) setActive(null);
    }
  }

  return { active, busy: active !== null, run };
}

/** The bar itself, at the top of a card. The fill grows by a CSS animation of `transform` (which runs without the page's own
 * thread, so it goes on while the window is busy), the pulse is one of `opacity`, started when the fill is full. */
export function LoadBar({ seconds }: { seconds: number }) {
  return (
    <div className="weft-start-loadbar" role="progressbar" aria-busy="true" style={{ ["--load-seconds" as string]: `${seconds}s` }}>
      <i />
    </div>
  );
}
