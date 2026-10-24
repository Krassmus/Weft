import { createPortal } from "react-dom";
import { create } from "zustand";
import { tr } from "../../core/i18n/tr";
import { estimatedSeconds, LoadBar, nextPaint, SMALL_BYTES } from "../start/openProgress";

/**
 * The bar while a module is opened from the menu (File > Open, a recently opened file, a file the system hands over) - the same estimate as on
 * the tiles of the start screen (openProgress.tsx): none for a small module, above that full after a time that goes with the size, then it
 * pulses until the module is open. The rest of the window is dimmed and cannot be clicked meanwhile. The tiles of the start screen have their
 * own bar and do not use this one.
 */
const useOpeningBar = create<{ seconds: number | null }>(() => ({ seconds: null }));

/** Shows the bar if a module of `bytes` size is large enough to need one, and waits until it has been drawn (the work that follows holds the
 * window up). Without a size (null) there is no bar. */
export async function showOpeningBar(bytes: number | null): Promise<void> {
  if (bytes === null || bytes <= SMALL_BYTES) return;
  useOpeningBar.setState({ seconds: estimatedSeconds(bytes) });
  await nextPaint();
}

export function hideOpeningBar(): void {
  if (useOpeningBar.getState().seconds !== null) useOpeningBar.setState({ seconds: null });
}

/** Mounted once, at the top of the app. */
export function OpeningBar() {
  const seconds = useOpeningBar((s) => s.seconds);
  if (seconds === null) return null;
  return createPortal(
    <div className="weft-opening-bar-backdrop" role="alert" aria-live="assertive">
      <div className="weft-opening-bar">
        <LoadBar seconds={seconds} />
        <span>{tr("ui.opening_module")}</span>
      </div>
    </div>,
    document.body,
  );
}
