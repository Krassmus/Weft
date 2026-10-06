import { NetworkAdapter } from "@automerge/automerge-repo/slim";
import type { Message, PeerId, PeerMetadata } from "@automerge/automerge-repo/slim";
import { decode, encode } from "cbor-x";
import { joinRoom } from "trystero";
import { create } from "zustand";

/** The state of the direct (WebRTC) connection, for the UI. */
export const useDirectConnection = create<{
  state: "off" | "searching" | "connected" | "failed";
  /** How many other people are connected directly. */
  peers: number;
  error: string | null;
}>(() => ({ state: "off", peers: 0, error: null }));

export interface WebRtcAdapterOptions {
  /** One room per shared document: whoever joins the same room (and knows its password) is connected
   * to everybody else in it. */
  roomId: string;
  /** Encrypts what the peers exchange to find each other (Trystero's `password`) - only people who
   * have the invitation link can complete the handshake. */
  password?: string;
  /** Overrides the public signaling relays (Nostr relays) used to introduce peers to each other. */
  relayUrls?: string[];
  /** TURN servers for networks through which no direct connection can be made. */
  turnServers?: RTCIceServer[];
  /** How long the repo waits for the first peer before it considers this connection ready anyway (and
   * so a document it is looking for unavailable). Finding each other over the public relays takes a
   * moment - a few seconds on a bad day - so this is generous (the others also forget a failed first attempt - a wrong password - only after
   * about twenty seconds); it ends as soon as somebody answers. */
  peerWaitMs?: number;
}

const APP_ID = "weft-collab";

/**
 * An Automerge network adapter over WebRTC: people editing the same document connect to each other
 * directly, with no server of ours in between. Only the *introduction* needs a third party - Trystero
 * does that over public relays (Nostr by default): the peers publish their connection offers there,
 * encrypted with the room password, and from then on talk over their own data channels. Everything
 * else is Automerge's own sync protocol (and the asset exchange of assetSync.ts, which rides on it).
 *
 * Two kinds of ids are in play: Trystero's own peer id for a connection, and the Automerge repo's
 * peer id - the one its messages are addressed with. When a connection opens, both sides tell each
 * other theirs ("hello"), and only then is the peer announced to the repo.
 */
export class WebRtcNetworkAdapter extends NetworkAdapter {
  // Trystero hands out the same room for the same name for as long as it exists, with the password
  // it was first joined with - so a new connection to a room (a retry with the right password after
  // a wrong one) has to wait until the previous one has really left it.
  private static leaving: Promise<unknown> = Promise.resolve();
  private closed = false;
  private room: ReturnType<typeof joinRoom> | null = null;
  private send_: ((data: Uint8Array, target: string) => Promise<void>) | null = null;
  private readonly byAutomergeId = new Map<string, string>();
  private readonly byTransportId = new Map<string, string>();
  private ready = false;
  private markReady: () => void = () => {};
  private readonly readyPromise: Promise<void>;

  constructor(private readonly options: WebRtcAdapterOptions) {
    super();
    this.readyPromise = new Promise((resolve) => {
      this.markReady = () => {
        this.ready = true;
        resolve();
      };
      setTimeout(() => this.markReady(), options.peerWaitMs ?? 25000);
    });
  }

  isReady(): boolean {
    return this.ready;
  }

  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  connect(peerId: PeerId, peerMetadata?: PeerMetadata): void {
    this.peerId = peerId;
    this.peerMetadata = peerMetadata;
    useDirectConnection.setState({ state: "searching", peers: 0, error: null });
    void WebRtcNetworkAdapter.leaving.then(() => {
      if (!this.closed) this.join();
    });
  }

  private join(): void {
    const room = joinRoom(
      {
        appId: APP_ID,
        password: this.options.password,
        ...(this.options.relayUrls ? { relayConfig: { urls: this.options.relayUrls } } : {}),
        ...(this.options.turnServers ? { turnConfig: this.options.turnServers } : {}),
      },
      this.options.roomId,
      {
        onJoinError: (details) =>
          useDirectConnection.setState({
            state: "failed",
            error: /password/i.test(details.error)
              ? "Falsches Passwort im Einladungslink."
              : "Die Direktverbindung ließ sich nicht aufbauen (vielleicht blockiert das Netzwerk sie).",
          }),
      },
    );
    this.room = room;

    const hello = room.makeAction<{ peerId: string; metadata: Record<string, string | boolean> }>("hello");
    const automerge = room.makeAction<Uint8Array>("automerge");
    this.send_ = (data, target) => automerge.send(data, { target });

    room.onPeerJoin = (transportId) => {
      void hello.send({ peerId: this.peerId as string, metadata: { ...this.peerMetadata } as Record<string, string | boolean> }, { target: transportId });
    };
    hello.onMessage = (greeting, { peerId: transportId }) => {
      this.byAutomergeId.set(greeting.peerId, transportId);
      this.byTransportId.set(transportId, greeting.peerId);
      this.markReady();
      this.updateStatus();
      this.emit("peer-candidate", { peerId: greeting.peerId as PeerId, peerMetadata: greeting.metadata as PeerMetadata });
    };
    room.onPeerLeave = (transportId) => {
      const automergeId = this.byTransportId.get(transportId);
      this.byTransportId.delete(transportId);
      if (!automergeId) return;
      this.byAutomergeId.delete(automergeId);
      this.updateStatus();
      this.emit("peer-disconnected", { peerId: automergeId as PeerId });
    };
    automerge.onMessage = (data) => {
      const message = decode(new Uint8Array(data as unknown as ArrayBuffer)) as Message & { data?: Uint8Array };
      if (message.data) message.data = new Uint8Array(message.data);
      this.emit("message", message);
    };
  }

  // Messages go out one after the other: Trystero starts every send on its own, so several at once can
  // arrive in any order - and the Automerge repo discards an ephemeral message that arrives after a
  // later one (which the exchange of files in assetSync.ts relies on, chunk by chunk).
  private outbox: Promise<void> = Promise.resolve();

  send(message: Message): void {
    const target = this.byAutomergeId.get(message.targetId);
    if (!target || !this.send_) return;
    const send = this.send_;
    const bytes = encode(message);
    this.outbox = this.outbox.then(() => send(bytes, target)).catch(() => undefined);
  }

  disconnect(): void {
    for (const automergeId of this.byAutomergeId.keys()) this.emit("peer-disconnected", { peerId: automergeId as PeerId });
    this.byAutomergeId.clear();
    this.byTransportId.clear();
    this.closed = true;
    if (this.room) WebRtcNetworkAdapter.leaving = this.room.leave().catch(() => undefined);
    this.room = null;
    useDirectConnection.setState({ state: "off", peers: 0, error: null });
  }

  private updateStatus(): void {
    const peers = this.byAutomergeId.size;
    useDirectConnection.setState((s) => (s.state === "failed" && peers === 0 ? s : { state: peers > 0 ? "connected" : "searching", peers, error: null }));
  }
}
