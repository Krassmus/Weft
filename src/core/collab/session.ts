import { BroadcastChannelNetworkAdapter } from "@automerge/automerge-repo-network-broadcastchannel";
import { WebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { currentHandle, openSharedDocument, repo } from "../document/store";
import { AssetSync } from "./assetSync";

/**
 * Collaboration on one document: the Automerge repo (see document/store.ts) is connected to other
 * peers over BroadcastChannel (other tabs/windows of the same app on this machine - handy for trying
 * things out) and/or a WebSocket sync server (see scripts/collab-server.mjs), and the document that is
 * being edited is announced to them. Whoever knows its URL ("automerge:...") can open it; from then
 * on every change anybody makes is merged into everyone's copy.
 */
export interface CollabOptions {
  /** ws://host:port of a sync server. */
  serverUrl?: string;
  /** Sync with other tabs of the same browser - on by default. */
  broadcast?: boolean;
}

let broadcastAttached = false;
const attachedServers = new Set<string>();

function connect({ serverUrl, broadcast = true }: CollabOptions): void {
  if (broadcast && !broadcastAttached) {
    repo.networkSubsystem.addNetworkAdapter(new BroadcastChannelNetworkAdapter());
    broadcastAttached = true;
  }
  if (serverUrl && !attachedServers.has(serverUrl)) {
    repo.networkSubsystem.addNetworkAdapter(new WebSocketClientAdapter(serverUrl));
    attachedServers.add(serverUrl);
  }
}

let assetSync: AssetSync | null = null;

/** (Re)starts the exchange of images, videos and fonts for the document being edited. */
function syncAssets(): void {
  assetSync?.stop();
  assetSync = new AssetSync(currentHandle());
  assetSync.start();
}

/** Starts sharing the document being edited; returns the URL others open it with. */
export function shareCurrentDocument(options: CollabOptions = {}): string {
  connect(options);
  syncAssets();
  return currentHandle().url;
}

/** Opens a document somebody else is sharing, replacing the one being edited. */
export async function joinSharedDocument(url: string, options: CollabOptions = {}): Promise<void> {
  connect(options);
  await openSharedDocument(url);
  syncAssets();
}
