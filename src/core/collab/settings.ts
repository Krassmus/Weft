import type { CollabOptions } from "./session";

/**
 * How this person connects for live collaboration (the "Netzwerk" section of the app's settings
 * window): signaling relays and a TURN server (people connect directly - WebRTC). Kept in the app's own storage - it describes this computer and this network, not a module -
 * and read by whatever connects (a file that is an invitation, see session.ts).
 */
export const COLLAB_RELAYS_KEY = "weft.collabRelays";
export const COLLAB_TURN_KEY = "weft.collabTurn";

export function readSetting(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* not persisted - fine */
  }
}

export interface TurnSetting {
  url?: string;
  user?: string;
  password?: string;
}

export function readTurnSetting(): TurnSetting {
  try {
    return JSON.parse(readSetting(COLLAB_TURN_KEY, "{}")) as TurnSetting;
  } catch {
    return {};
  }
}

/** The connection options as they are currently set (direct connection only if the system can). */
export function loadCollabOptions(): CollabOptions {
  const turn = readTurnSetting();
  return {
    direct: typeof RTCPeerConnection !== "undefined",
    relayUrls: readSetting(COLLAB_RELAYS_KEY, "").split(/\s+/).filter(Boolean),
    turnServers: turn.url?.trim()
      ? [{ urls: turn.url.trim(), username: turn.user?.trim() || undefined, credential: turn.password || undefined }]
      : [],
  };
}
