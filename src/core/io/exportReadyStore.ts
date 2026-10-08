import { create } from "zustand";

/** A file made for handing on (an export, a copy of the module) that waits for the person to share it: the dialog that
 * offers that is ExportReadyDialog (features/editor/LibraryDialogs.tsx). Only where there is a library (see libraryMode). */
export interface ReadyFile {
  name: string;
  /** Where it was kept (see writeExport in library.ts). */
  path: string;
  bytes: Uint8Array;
}

export const useExportReady = create<{
  file: ReadyFile | null;
  show: (file: ReadyFile) => void;
  close: () => void;
}>((set) => ({
  file: null,
  show: (file) => set({ file }),
  close: () => set({ file: null }),
}));
