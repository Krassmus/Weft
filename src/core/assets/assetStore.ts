import { create } from "zustand";

/**
 * Binary asset payloads live here, not in the immer-tracked WeftDocument: images shouldn't
 * flow through JSON patches or get diffed on every keystroke. The document only ever stores
 * an AssetMeta {id, fileName, mimeType} reference; the bytes are looked up by id in this store,
 * populated on import and read again on export.
 */
interface AssetState {
  blobs: Map<string, Blob>;
  objectUrls: Map<string, string>;
  setAsset: (id: string, blob: Blob) => void;
  getObjectUrl: (id: string) => string | undefined;
  clear: () => void;
}

export const useAssetStore = create<AssetState>((set, get) => ({
  blobs: new Map(),
  objectUrls: new Map(),

  setAsset: (id, blob) =>
    set((state) => {
      const blobs = new Map(state.blobs);
      blobs.set(id, blob);
      const objectUrls = new Map(state.objectUrls);
      const previous = objectUrls.get(id);
      if (previous) URL.revokeObjectURL(previous);
      objectUrls.delete(id);
      return { blobs, objectUrls };
    }),

  getObjectUrl: (id) => {
    const state = get();
    const existing = state.objectUrls.get(id);
    if (existing) return existing;
    const blob = state.blobs.get(id);
    if (!blob) return undefined;
    const url = URL.createObjectURL(blob);
    set({ objectUrls: new Map(state.objectUrls).set(id, url) });
    return url;
  },

  clear: () =>
    set((state) => {
      for (const url of state.objectUrls.values()) URL.revokeObjectURL(url);
      return { blobs: new Map(), objectUrls: new Map() };
    }),
}));
