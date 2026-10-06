import { parseAutomergeUrl } from "@automerge/automerge-repo/slim";
import { BroadcastChannelNetworkAdapter } from "@automerge/automerge-repo-network-broadcastchannel";
import { WebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { allowSharing, currentHandle, openSharedDocument, repo } from "../document/store";
import { AssetSync } from "./assetSync";
import { useDirectConnection, WebRtcNetworkAdapter } from "./webrtcAdapter";

/**
 * Collaboration on one document: the Automerge repo (see document/store.ts) is connected to other
 * peers - directly over WebRTC (no server of ours: see webrtcAdapter.ts), over BroadcastChannel (other
 * tabs/windows of the same app on this machine), and/or through a WebSocket sync server of someone's
 * own (scripts/collab-server.mjs) - and the document that is being edited is announced to them.
 * Whoever has its invitation link can open it; from then on every change anybody makes is merged
 * into everyone's copy.
 *
 * The invitation link is the document's Automerge URL plus a random secret: "automerge:...?k=...".
 * The URL names the document, the secret is the password of the direct connection - without it the
 * peers' introductions can't even be decrypted.
 */
export interface CollabOptions {
  /** Connect directly to the other people (WebRTC) - on by default. */
  direct?: boolean;
  /** ws://host:port of a sync server, if there is one. */
  serverUrl?: string;
  /** Sync with other tabs of the same browser. */
  broadcast?: boolean;
  /** Signaling relays (Nostr) the direct connection finds the others over, instead of the public
   * defaults. Everybody has to use the same ones - so they go into the invitation link, and a
   * joiner uses the link's. */
  relayUrls?: string[];
  /** TURN servers for networks in which no direct connection can be made (this person's own). */
  turnServers?: RTCIceServer[];
}

export interface Invitation {
  /** The document's Automerge URL. */
  url: string;
  /** The password of the direct connection. */
  secret: string | null;
  /** The signaling relays to use, if not the public defaults. */
  relays: string[];
}

export function formatInvitation({ url, secret, relays }: Invitation): string {
  const query = new URLSearchParams();
  if (secret) query.set("k", secret);
  for (const relay of relays) query.append("r", relay);
  const text = query.toString();
  return text ? `${url}?${text}` : url;
}

export function parseInvitation(text: string): Invitation {
  const [url, query = ""] = text.trim().split("?");
  const params = new URLSearchParams(query);
  return { url, secret: params.get("k"), relays: params.getAll("r") };
}

function newSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// A document keeps the secret it was first shared with for as long as this app runs, so the link
// stays valid when it is shared again.
const secrets = new Map<string, string>();

let broadcastAttached = false;
const attachedServers = new Set<string>();
let directAdapter: WebRtcNetworkAdapter | null = null;
let assetSync: AssetSync | null = null;

function connect(
  documentId: string,
  secret: string | null,
  { direct = true, serverUrl, broadcast = false, relayUrls, turnServers }: CollabOptions,
): void {
  if (broadcast && !broadcastAttached) {
    repo.networkSubsystem.addNetworkAdapter(new BroadcastChannelNetworkAdapter());
    broadcastAttached = true;
  }
  if (serverUrl && !attachedServers.has(serverUrl)) {
    repo.networkSubsystem.addNetworkAdapter(new WebSocketClientAdapter(serverUrl));
    attachedServers.add(serverUrl);
  }
  // One direct connection at a time: to the room of the document being edited.
  directAdapter?.disconnect();
  directAdapter = null;
  if (direct) {
    directAdapter = new WebRtcNetworkAdapter({
      roomId: `doc-${documentId}`,
      password: secret ?? undefined,
      relayUrls: relayUrls && relayUrls.length > 0 ? relayUrls : undefined,
      turnServers: turnServers && turnServers.length > 0 ? turnServers : undefined,
    });
    repo.networkSubsystem.addNetworkAdapter(directAdapter);
  }
}

/** (Re)starts the exchange of images, videos and fonts for the document being edited. */
function syncAssets(): void {
  assetSync?.stop();
  assetSync = new AssetSync(currentHandle());
  assetSync.start();
}

/** Starts sharing the document being edited; returns the invitation link to give to others. */
export function shareCurrentDocument(options: CollabOptions = {}): string {
  const handle = currentHandle();
  let secret = secrets.get(handle.documentId);
  if (!secret) {
    secret = newSecret();
    secrets.set(handle.documentId, secret);
  }
  allowSharing(handle.documentId);
  connect(handle.documentId, secret, options);
  syncAssets();
  return formatInvitation({ url: handle.url, secret, relays: options.relayUrls ?? [] });
}

/** Opens a document somebody else is sharing, by invitation link. Resolves once it has arrived. */
export async function joinSharedDocument(invitation: string, options: CollabOptions = {}): Promise<void> {
  const { url, secret, relays } = parseInvitation(invitation);
  let documentId: string;
  try {
    documentId = parseAutomergeUrl(url as never).documentId;
  } catch {
    throw new Error("Das ist kein gültiger Einladungslink.");
  }
  if (secret) secrets.set(documentId, secret);
  allowSharing(documentId);
  connect(documentId, secret, { ...options, relayUrls: relays.length > 0 ? relays : options.relayUrls });
  try {
    await openSharedDocument(url);
  } catch (error) {
    // A direct connection that failed for a reason of its own (wrong password in the link) says why.
    const direct = useDirectConnection.getState();
    throw direct.state === "failed" && direct.error ? new Error(direct.error) : error;
  }
  syncAssets();
}
