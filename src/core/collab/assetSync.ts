import type { DocHandle } from "@automerge/automerge-repo";
import { create } from "zustand";
import { useAssetStore } from "../assets/assetStore";
import { usedAssetIds } from "../document/usedAssets";
import { currentHandle, repo } from "../document/store";
import type { WeftModule } from "../types";

/**
 * Images, videos and fonts are not part of the Automerge document (it would only carry their
 * metadata, see AssetMeta) - so a peer that joins, or that receives a block someone just added, has
 * to get the files themselves from whoever has them. This is that exchange, by asset id, over the
 * ephemeral messages of the document's own connection (DocHandle.broadcast) - so it runs over
 * whatever transport the Automerge repo is connected by (BroadcastChannel, a sync server, later
 * WebRTC) without a channel of its own:
 *
 *   want   - "I'm missing these ids" (to everybody, repeated while something is missing)
 *   have   - "I have it" (to the asker, a few bytes)  -> the asker picks the first holder
 *   get    - "send it to me"                           -> the holder streams it
 *   chunk  - 48 KB of it, at most WINDOW of them in flight; the receiver acknowledges every few
 *   ack
 *
 * Only what the module still references is requested (usedAssetIds, plus the custom fonts): the
 * metadata list also names files that were replaced or deleted long ago and are not saved any more.
 */
const TAG = "weft-asset";
const CHUNK_BYTES = 48 * 1024;
const WINDOW = 16;
const ACK_EVERY = 8;
const RETRY_MS = 4000;
const STALL_MS = 15000;

type Message =
  | { tag: typeof TAG; t: "want"; from: string; ids: string[] }
  | { tag: typeof TAG; t: "have"; from: string; to: string; id: string; size: number }
  | { tag: typeof TAG; t: "get"; from: string; to: string; id: string }
  | { tag: typeof TAG; t: "chunk"; from: string; to: string; id: string; index: number; total: number; data: Uint8Array }
  | { tag: typeof TAG; t: "ack"; from: string; to: string; id: string; upTo: number };

/** What is still to come, for the UI. */
export const useAssetTransfers = create<{
  /** Assets the module references that this copy doesn't have yet. */
  missing: number;
  /** The ones being received right now, by asset id. */
  transfers: Record<string, { received: number; total: number; size: number }>;
}>(() => ({ missing: 0, transfers: {} }));

interface Incoming {
  from: string;
  size: number;
  chunks: Uint8Array[];
  received: number;
  lastAt: number;
}

export class AssetSync {
  private readonly me = repo.networkSubsystem.peerId;
  private readonly incoming = new Map<string, Incoming>();
  private readonly requested = new Map<string, number>();
  private readonly acked = new Map<string, number>(); // outgoing transfers: "id|peer" -> highest ack
  private readonly ackWaiters = new Map<string, () => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly handle: DocHandle<WeftModule>) {}

  start(): void {
    this.handle.on("ephemeral-message", this.onMessage);
    this.handle.on("change", this.scheduleScan);
    this.timer = setInterval(() => this.scan(), RETRY_MS);
    this.scan();
  }

  stop(): void {
    this.handle.off("ephemeral-message", this.onMessage);
    this.handle.off("change", this.scheduleScan);
    if (this.timer) clearInterval(this.timer);
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.timer = this.scanTimer = null;
    useAssetTransfers.setState({ missing: 0, transfers: {} });
  }

  private send(message: Message): void {
    this.handle.broadcast(message);
  }

  /** The ids of the files the module references but this copy doesn't have. */
  private missingIds(): string[] {
    const content = this.handle.doc() as WeftModule;
    const ids = new Set(usedAssetIds(content));
    for (const font of content.customFonts) ids.add(font.id);
    const have = useAssetStore.getState().blobs;
    return [...ids].filter((id) => !have.has(id));
  }

  private scheduleScan = (): void => {
    if (this.scanTimer) return;
    this.scanTimer = setTimeout(() => {
      this.scanTimer = null;
      this.scan();
    }, 300);
  };

  private scan(): void {
    if (currentHandle() !== this.handle) {
      this.stop(); // another document has been opened since
      return;
    }
    const now = Date.now();
    for (const [id, transfer] of this.incoming) {
      if (now - transfer.lastAt > STALL_MS) this.incoming.delete(id); // the holder went away - ask again
    }
    const missing = this.missingIds();
    useAssetTransfers.setState({ missing: missing.length });
    const toAsk = missing.filter((id) => !this.incoming.has(id) && now - (this.requested.get(id) ?? 0) >= RETRY_MS - 500);
    if (toAsk.length === 0) return;
    for (const id of toAsk) this.requested.set(id, now);
    this.send({ tag: TAG, t: "want", from: this.me, ids: toAsk });
  }

  private onMessage = ({ message }: { message: unknown }): void => {
    const m = message as Message | null;
    if (!m || m.tag !== TAG || m.from === this.me) return;
    if ("to" in m && m.to !== this.me) return;
    switch (m.t) {
      case "want":
        for (const id of m.ids) {
          const blob = useAssetStore.getState().blobs.get(id);
          if (blob) this.send({ tag: TAG, t: "have", from: this.me, to: m.from, id, size: blob.size });
        }
        break;
      case "have":
        if (useAssetStore.getState().blobs.has(m.id) || this.incoming.has(m.id)) break;
        this.incoming.set(m.id, { from: m.from, size: m.size, chunks: [], received: 0, lastAt: Date.now() });
        this.send({ tag: TAG, t: "get", from: this.me, to: m.from, id: m.id });
        break;
      case "get":
        void this.sendBlob(m.id, m.from);
        break;
      case "chunk":
        this.receiveChunk(m);
        break;
      case "ack": {
        const key = `${m.id}|${m.from}`;
        this.acked.set(key, Math.max(this.acked.get(key) ?? -1, m.upTo));
        this.ackWaiters.get(key)?.();
        break;
      }
    }
  };

  private receiveChunk(m: Extract<Message, { t: "chunk" }>): void {
    const transfer = this.incoming.get(m.id);
    if (!transfer || transfer.from !== m.from || m.index !== transfer.received) return;
    transfer.chunks.push(new Uint8Array(m.data));
    transfer.received++;
    transfer.lastAt = Date.now();
    const done = transfer.received === m.total;
    if (done || transfer.received % ACK_EVERY === 0) {
      this.send({ tag: TAG, t: "ack", from: this.me, to: m.from, id: m.id, upTo: m.index });
    }
    if (!done) {
      useAssetTransfers.setState((s) => ({
        transfers: { ...s.transfers, [m.id]: { received: transfer.received, total: m.total, size: transfer.size } },
      }));
      return;
    }
    this.incoming.delete(m.id);
    useAssetTransfers.setState((s) => {
      const { [m.id]: _done, ...rest } = s.transfers;
      return { transfers: rest };
    });
    const blob = new Blob(transfer.chunks as BlobPart[], { type: this.mimeTypeOf(m.id) });
    if (blob.size !== transfer.size) {
      this.requested.delete(m.id); // damaged on the way - ask again
      return;
    }
    useAssetStore.getState().setAsset(m.id, blob);
    this.scan();
  }

  private mimeTypeOf(id: string): string {
    const content = this.handle.doc() as WeftModule;
    return (
      content.assets.find((a) => a.id === id)?.mimeType ??
      content.customFonts.find((f) => f.id === id)?.mimeType ??
      "application/octet-stream"
    );
  }

  /** Streams one file to `peer` in chunks, never more than WINDOW unacknowledged. */
  private async sendBlob(id: string, peer: string): Promise<void> {
    const blob = useAssetStore.getState().blobs.get(id);
    if (!blob) return;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const total = Math.max(1, Math.ceil(bytes.length / CHUNK_BYTES));
    const key = `${id}|${peer}`;
    this.acked.set(key, -1);
    try {
      for (let index = 0; index < total; index++) {
        while (index - (this.acked.get(key) ?? -1) > WINDOW) {
          if (!(await this.waitForAck(key))) return; // the receiver went away
        }
        const data = bytes.slice(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES);
        this.send({ tag: TAG, t: "chunk", from: this.me, to: peer, id, index, total, data });
      }
    } finally {
      this.acked.delete(key);
      this.ackWaiters.delete(key);
    }
  }

  private waitForAck(key: string): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.ackWaiters.delete(key);
        resolve(false);
      }, STALL_MS);
      this.ackWaiters.set(key, () => {
        clearTimeout(timeout);
        this.ackWaiters.delete(key);
        resolve(true);
      });
    });
  }
}
