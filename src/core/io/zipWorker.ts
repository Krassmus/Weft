import { zipSync } from "fflate";
import type { Zippable } from "fflate";

/**
 * Zips a module in a Web Worker of its own (see zipInWorker in pack.ts). fflate has an asynchronous zip, too - but it works out the
 * checksum of every file on the calling thread, which for a module with a large video is most of a second of a window that does
 * not answer. Here the whole job - checksums included - is the worker's.
 */
self.onmessage = (event: MessageEvent<{ files: Zippable }>) => {
  try {
    const bytes = zipSync(event.data.files, { level: 6 });
    (self as unknown as Worker).postMessage({ bytes }, [bytes.buffer]);
  } catch (error) {
    (self as unknown as Worker).postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
