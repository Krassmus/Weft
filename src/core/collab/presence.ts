import type { DocHandle } from "@automerge/automerge-repo";
import { create } from "zustand";
import { currentHandle, repo, useDocumentStore } from "../document/store";
import { useProfileStore } from "../profile/profileStore";
import type { SelectionRef } from "../document/store";
import type { WeftModule } from "../types";

/**
 * Who is working on the module right now, and on what: every connected person tells the others their
 * name, the slide they are on and the blocks they have selected - ephemeral messages on the
 * document's own connection (like the file exchange of assetSync.ts), nothing of it is stored in the
 * document. The UI shows it as avatars, dots on the slides and a coloured frame with a name around
 * the blocks somebody else has selected.
 *
 * Every state message is a full snapshot, sent when it changes and repeated every few seconds - so a
 * newcomer learns about everybody within moments, a person who vanishes without saying goodbye (closed
 * laptop, lost connection) is forgotten after a while, and a lost message doesn't matter.
 */
const TAG = "weft-presence";
const HEARTBEAT_MS = 5000;
// Generous: a window in the background has its timers slowed down (sometimes to one a minute), so its
// heartbeat comes late - and leaving properly is announced (sayBye) anyway.
const FORGET_AFTER_MS = 45000;

export interface PeerPresence {
  peerId: string;
  name: string;
  /** Their avatar picture (a small data URL), if they have one and it has arrived. */
  avatar: string | null;
  /** The slide they are on (null: none, or editing a layout). */
  pageId: string | null;
  /** The layout they are editing, if that is what they are doing. */
  layoutId: string | null;
  /** The blocks they have selected. */
  blockIds: string[];
  lastSeen: number;
}

type Message =
  | {
      tag: typeof TAG;
      t: "state";
      from: string;
      name: string;
      pageId: string | null;
      layoutId: string | null;
      blockIds: string[];
      /** Whether this person has an avatar at all. */
      hasAvatar: boolean;
      /** The avatar itself - only when it changed or somebody needs it, not with every heartbeat (a
       * receiver keeps what it has). null: removed. */
      avatar?: string | null;
    }
  | { tag: typeof TAG; t: "bye"; from: string }
  /** "I'm missing your avatar" - answered with a state message that carries it. */
  | { tag: typeof TAG; t: "want-avatar"; from: string; to: string };

export const usePresence = create<{ peers: Record<string, PeerPresence> }>(() => ({ peers: {} }));

/** A colour that stays the same for a person (derived from their peer id) on every screen. */
export function presenceColor(peerId: string): string {
  let hash = 0;
  for (let i = 0; i < peerId.length; i++) hash = (hash * 31 + peerId.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360} 70% 52%)`;
}

function describe(selection: SelectionRef | null, content: WeftModule): Pick<PeerPresence, "pageId" | "layoutId" | "blockIds"> {
  const none = { pageId: null, layoutId: null, blockIds: [] as string[] };
  if (!selection) return none;
  switch (selection.type) {
    case "page":
      return { ...none, pageId: selection.pageId };
    case "layout":
      return { ...none, layoutId: selection.layoutId };
    case "logic":
      return none;
    case "event":
      return { ...none, pageId: selection.pageId };
    case "group": {
      const group = content.pages[selection.pageId]?.groups.find((g) => g.id === selection.groupId);
      return { ...none, pageId: selection.pageId, blockIds: group ? [...group.blockIds] : [] };
    }
    case "block":
    case "blocks": {
      const blockIds = selection.type === "block" ? [selection.blockId] : selection.blockIds;
      return selection.container.kind === "page"
        ? { pageId: selection.container.pageId, layoutId: null, blockIds }
        : { pageId: null, layoutId: selection.container.layoutId, blockIds };
    }
  }
}

export class PresenceSync {
  private readonly me = repo.networkSubsystem.peerId;
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: Array<() => void> = [];
  private sendTimer: ReturnType<typeof setTimeout> | null = null;
  // Where this person last was: selecting nothing doesn't take them off their slide.
  private lastPageId: string | null = null;
  // The avatar the others have last been sent.
  private sentAvatar: string | null = null;
  private lastAvatarRequest = new Map<string, number>();

  constructor(private readonly handle: DocHandle<WeftModule>) {}

  start(): void {
    this.handle.on("ephemeral-message", this.onMessage);
    // A person whose connection is gone has left, whether they said goodbye or not.
    repo.networkSubsystem.on("peer-disconnected", this.onDisconnected);
    this.unsubscribe.push(
      () => repo.networkSubsystem.off("peer-disconnected", this.onDisconnected),
      useDocumentStore.subscribe((state, previous) => {
        if (state.selection !== previous.selection) this.scheduleSend();
      }),
      useProfileStore.subscribe(() => this.scheduleSend()),
    );
    this.timer = setInterval(() => this.tick(), HEARTBEAT_MS);
    // Closing the window says goodbye (best effort - otherwise the others forget this person after a while).
    window.addEventListener("pagehide", this.sayBye);
    document.addEventListener("visibilitychange", this.onVisible);
    this.unsubscribe.push(() => {
      window.removeEventListener("pagehide", this.sayBye);
      document.removeEventListener("visibilitychange", this.onVisible);
    });
    this.sendState();
  }

  private onVisible = (): void => {
    if (document.visibilityState === "visible") this.sendState();
  };

  private sayBye = (): void => {
    this.handle.broadcast({ tag: TAG, t: "bye", from: this.me } satisfies Message);
  };

  stop(): void {
    this.handle.off("ephemeral-message", this.onMessage);
    this.unsubscribe.forEach((off) => off());
    this.unsubscribe = [];
    if (this.timer) clearInterval(this.timer);
    if (this.sendTimer) clearTimeout(this.sendTimer);
    this.timer = this.sendTimer = null;
    this.sayBye();
    usePresence.setState({ peers: {} });
  }

  private tick(): void {
    if (currentHandle() !== this.handle) {
      this.stop(); // another document has been opened since
      return;
    }
    const now = Date.now();
    usePresence.setState((s) => {
      const peers = Object.fromEntries(Object.entries(s.peers).filter(([, p]) => now - p.lastSeen < FORGET_AFTER_MS));
      return Object.keys(peers).length === Object.keys(s.peers).length ? s : { peers };
    });
    this.sendState();
  }

  /** Selecting things in quick succession (a drag across blocks) is sent as one update. */
  private scheduleSend(): void {
    if (this.sendTimer) return;
    this.sendTimer = setTimeout(() => {
      this.sendTimer = null;
      this.sendState();
    }, 120);
  }

  private sendState(withAvatar = false): void {
    const { selection } = useDocumentStore.getState();
    const { name, avatar } = useProfileStore.getState();
    const includeAvatar = withAvatar || avatar !== this.sentAvatar;
    if (includeAvatar) this.sentAvatar = avatar;
    const where = describe(selection, this.handle.doc() as WeftModule);
    if (where.pageId) this.lastPageId = where.pageId;
    this.handle.broadcast({
      tag: TAG,
      t: "state",
      from: this.me,
      name,
      pageId: where.pageId ?? (where.layoutId ? null : this.lastPageId),
      layoutId: where.layoutId,
      blockIds: where.blockIds,
      hasAvatar: !!avatar,
      ...(includeAvatar ? { avatar } : {}),
    } satisfies Message);
  }

  private onDisconnected = ({ peerId }: { peerId: string }): void => {
    usePresence.setState((s) => {
      if (!(peerId in s.peers)) return s;
      const { [peerId]: _gone, ...peers } = s.peers;
      return { peers };
    });
  };

  private onMessage = ({ message }: { message: unknown }): void => {
    const m = message as Message | null;
    if (!m || m.tag !== TAG || m.from === this.me) return;
    if ("to" in m && m.to !== this.me) return;
    if (m.t === "want-avatar") {
      this.sendState(true);
      return;
    }
    if (m.t === "bye") {
      usePresence.setState((s) => {
        const { [m.from]: _gone, ...peers } = s.peers;
        return { peers };
      });
      return;
    }
    const previous = usePresence.getState().peers[m.from];
    const avatar = "avatar" in m ? (m.avatar ?? null) : (previous?.avatar ?? null);
    usePresence.setState((s) => ({
      peers: {
        ...s.peers,
        [m.from]: {
          peerId: m.from,
          name: m.name,
          avatar,
          pageId: m.pageId,
          layoutId: m.layoutId,
          blockIds: m.blockIds,
          lastSeen: Date.now(),
        },
      },
    }));
    // Somebody new: tell them where we are (and what we look like) right away instead of making them
    // wait for the next beat.
    if (!previous) this.sendState(true);
    // They have an avatar that never reached us (a lost message, or we joined in between): ask for it -
    // not more than once in a while.
    if (m.hasAvatar && !avatar && Date.now() - (this.lastAvatarRequest.get(m.from) ?? 0) > HEARTBEAT_MS) {
      this.lastAvatarRequest.set(m.from, Date.now());
      this.handle.broadcast({ tag: TAG, t: "want-avatar", from: this.me, to: m.from } satisfies Message);
    }
  };
}

/** The other people on a slide. */
export function usePageViewers(pageId: string): PeerPresence[] {
  const peers = usePresence((s) => s.peers);
  return Object.values(peers).filter((p) => p.pageId === pageId);
}

/** The other people who have this block selected. */
export function useBlockViewers(blockId: string): PeerPresence[] {
  const peers = usePresence((s) => s.peers);
  return Object.values(peers).filter((p) => p.blockIds.includes(blockId));
}
