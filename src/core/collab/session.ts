import { parseAutomergeUrl } from "@automerge/automerge-repo/slim";
import { BroadcastChannelNetworkAdapter } from "@automerge/automerge-repo-network-broadcastchannel";
import { WebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { allowSharing, currentHandle, openSharedDocument, repo, useDocumentStore } from "../document/store";
import { confirmDestructive } from "../io/fileIO";
import { loadCollabOptions } from "./settings";
import { AssetSync } from "./assetSync";
import { PresenceSync } from "./presence";
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
 * peers' introductions can't even be decrypted. "Datei als Einladung" (a switch in the module settings,
 * see the end of this file) puts the same two things into the saved file as well, so there is one thing
 * - being invited - and two ways of handing it on: the file, or the link.
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

// A document keeps the secret it was first shared with - also across restarts of the app, since the
// document itself comes back under the same id (see importHistory in document/store.ts) - so the link
// stays valid when it is shared again, and links given out earlier keep working. Kept in the app's
// own storage, never in a file.
const SECRETS_KEY = "weft:collabSecrets";
const MAX_SECRETS = 200;

const secrets = {
  load(): Record<string, string> {
    try {
      return JSON.parse(localStorage.getItem(SECRETS_KEY) ?? "{}") as Record<string, string>;
    } catch {
      return {};
    }
  },
  get(documentId: string): string | undefined {
    return this.load()[documentId];
  },
  set(documentId: string, secret: string): void {
    const all = this.load();
    delete all[documentId];
    all[documentId] = secret; // most recently used last
    const keep = Object.entries(all).slice(-MAX_SECRETS);
    try {
      localStorage.setItem(SECRETS_KEY, JSON.stringify(Object.fromEntries(keep)));
    } catch {
      /* not remembered - the link then changes next time */
    }
  },
};

// The document the direct connection belongs to (see connect) - to tell, when another document gets
// opened, whether the connection still is its own.
let connectedDocumentId: string | null = null;

let broadcastAttached = false;
const attachedServers = new Set<string>();
let directAdapter: WebRtcNetworkAdapter | null = null;
let assetSync: AssetSync | null = null;
let presenceSync: PresenceSync | null = null;

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
  connectedDocumentId = documentId;
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

/** (Re)starts what runs on top of the connection for the document being edited: the exchange of
 * images, videos and fonts, and who-is-where. */
function startSessionServices(): void {
  assetSync?.stop();
  assetSync = new AssetSync(currentHandle());
  assetSync.start();
  presenceSync?.stop();
  presenceSync = new PresenceSync(currentHandle());
  presenceSync.start();
}

/** The link that invites somebody to the open document (with "Datei als Einladung" switched on), for people
 * who don't have the file - or null if it isn't switched on. */
export function invitationLink(): string | null {
  const { live } = useDocumentStore.getState();
  return live ? formatInvitation({ url: currentHandle().url, secret: live.secret, relays: live.relays }) : null;
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
  // Having accepted an invitation, this copy belongs to the group: a file saved from it is an invitation
  // too (see "Datei als Einladung"), and needn't be asked about when it is opened.
  if (secret) {
    useDocumentStore.getState().setLive({ secret, relays: relays.length > 0 ? relays : (options.relayUrls ?? []) });
    trust(documentId);
  }
  startSessionServices();
}

/** Leaves the room of the document being edited and stops what ran on top of the connection. */
function stopConnection(): void {
  directAdapter?.disconnect();
  directAdapter = null;
  connectedDocumentId = null;
  assetSync?.stop();
  assetSync = null;
  presenceSync?.stop();
  presenceSync = null;
}

// ---- The file as the invitation ----------------------------------------------------------------
//
// With "Datei als Einladung" switched on (a checkbox in the module's settings), the file itself says
// where the others are: saved, it carries the document id and the password of the room (see
// LiveInvitation in core/types.ts), so everybody who is given the file - by putting it into a shared
// Nextcloud folder, say - ends up in the same room by simply opening it. Nothing happens for a file that
// wasn't saved with it on, and nothing is written into an exported module.

const TRUSTED_KEY = "weft:liveTrusted";
const MAX_TRUSTED = 500;
// Files this session was asked about and declined.
const declined = new Set<string>();

function trustedDocuments(): string[] {
  try {
    return JSON.parse(localStorage.getItem(TRUSTED_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function trust(documentId: string): void {
  const all = trustedDocuments().filter((id) => id !== documentId);
  all.push(documentId);
  try {
    localStorage.setItem(TRUSTED_KEY, JSON.stringify(all.slice(-MAX_TRUSTED)));
  } catch {
    /* asked again next time - fine */
  }
}

/** Switches "Datei als Einladung" on for the document being edited: the file is saved as an invitation
 * from now on, and this document connects right away. */
export function enableLiveCollaboration(): void {
  const handle = currentHandle();
  let secret = secrets.get(handle.documentId);
  if (!secret) {
    secret = newSecret();
    secrets.set(handle.documentId, secret);
  }
  const options = loadCollabOptions();
  useDocumentStore.getState().setLive({ secret, relays: options.relayUrls ?? [] });
  // Whoever switched it on needn't be asked about their own file.
  trust(handle.documentId);
  declined.delete(handle.documentId);
  allowSharing(handle.documentId);
  connect(handle.documentId, secret, options);
  startSessionServices();
}

/** Switches it off: the file is saved without the invitation from now on, and this document leaves the
 * room. (Copies of the file that were saved with it on stay invitations.) */
export function disableLiveCollaboration(): void {
  useDocumentStore.getState().setLive(null);
  stopConnection();
}

/** Connects the open document to the room its file invites to - asking once, per file and computer,
 * whether that is wanted: opening a file shouldn't be able to connect this computer to strangers (and
 * send them what is typed into it) without a word. `askAgain`: ask even if this was declined earlier (the
 * person pressed "Jetzt verbinden"). Resolves to whether it connected. */
export async function connectLiveCollaboration(askAgain = false): Promise<boolean> {
  const handle = currentHandle();
  const { live } = useDocumentStore.getState();
  if (!live) return false;
  if (!trustedDocuments().includes(handle.documentId)) {
    if (declined.has(handle.documentId) && !askAgain) return false;
    const accepted = await confirmDestructive(
      "Diese Datei ist zur Live-Zusammenarbeit eingerichtet: Beim Öffnen verbindet sich Weft direkt mit den anderen, die sie gerade geöffnet haben, und tauscht Änderungen mit ihnen aus - auch was du hier tippst. Verbinden?",
      "Live-Zusammenarbeit",
    );
    // Opening another document in the meantime makes the answer moot.
    if (currentHandle() !== handle) return false;
    if (!accepted) {
      declined.add(handle.documentId);
      return false;
    }
    trust(handle.documentId);
  }
  const options = loadCollabOptions();
  secrets.set(handle.documentId, live.secret);
  allowSharing(handle.documentId);
  connect(handle.documentId, live.secret, { ...options, relayUrls: live.relays.length > 0 ? live.relays : options.relayUrls });
  startSessionServices();
  return true;
}

/** Called whenever the document being edited has been replaced: connects if the new one is an
 * invitation, and leaves the room of the one before if that isn't this document's own. */
export async function syncLiveForCurrentDocument(): Promise<void> {
  const handle = currentHandle();
  if (useDocumentStore.getState().live) {
    if (connectedDocumentId !== handle.documentId) await connectLiveCollaboration();
    return;
  }
  if (connectedDocumentId && connectedDocumentId !== handle.documentId) stopConnection();
}
